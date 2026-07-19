import type {
  AckResult,
  ClientToServerEvents,
  RoomMembershipData,
  ServerToClientEvents,
} from "@bugrace/shared";
import type { DefaultEventsMap, Server, Socket } from "socket.io";
import { z } from "zod";

import { publicChallenge } from "../game/challenge.js";
import {
  activateRace,
  createRoom,
  finishRaceIfReady,
  joinRoom,
  removePlayer,
  startRace,
  submitAnswer,
} from "../game/room-service.js";

export interface SocketData {
  playerId?: string;
  roomCode?: string;
}

type BugRaceServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

type BugRaceSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

const connectionPingPayloadSchema = z
  .object({
    sentAt: z.iso.datetime(),
  })
  .strict();

function serverFailure<T>(): AckResult<T> {
  return {
    ok: false,
    error: {
      code: "SERVER_ERROR",
      message: "The server could not complete that request.",
    },
  };
}

function finishRaceAndBroadcast(io: BugRaceServer, roomCode: string): void {
  const completion = finishRaceIfReady(roomCode);

  if (!completion) {
    return;
  }

  io.to(roomCode).emit("room:state", completion.room);
  io.to(roomCode).emit("race:finished", completion.result);
}

export function registerSocketHandlers(
  io: BugRaceServer,
  socket: BugRaceSocket,
): void {
  console.log(`Socket connected: ${socket.id}`);

  socket.emit("connection:ready", {
    socketId: socket.id,
    connectedAt: new Date().toISOString(),
  });

  socket.on("connection:ping", (payload, acknowledge) => {
    if (!connectionPingPayloadSchema.safeParse(payload).success) {
      return;
    }

    acknowledge({
      ok: true,
      receivedAt: new Date().toISOString(),
    });
  });

  socket.on("room:create", async (payload, acknowledge) => {
    const result = createRoom(
      payload,
      socket.id,
      socket.data.playerId !== undefined || socket.data.roomCode !== undefined,
    );

    if (!result.ok) {
      acknowledge(result);
      return;
    }

    socket.data.playerId = result.data.playerId;
    socket.data.roomCode = result.data.room.code;

    try {
      await socket.join(result.data.room.code);
      acknowledge(result);
      io.to(result.data.room.code).emit("room:state", result.data.room);
    } catch {
      removePlayer(result.data.room.code, result.data.playerId, socket.id);
      delete socket.data.playerId;
      delete socket.data.roomCode;
      acknowledge(serverFailure<RoomMembershipData>());
    }
  });

  socket.on("room:join", async (payload, acknowledge) => {
    const result = joinRoom(
      payload,
      socket.id,
      socket.data.playerId !== undefined || socket.data.roomCode !== undefined,
    );

    if (!result.ok) {
      acknowledge(result);
      return;
    }

    socket.data.playerId = result.data.playerId;
    socket.data.roomCode = result.data.room.code;

    try {
      await socket.join(result.data.room.code);
      acknowledge(result);
      io.to(result.data.room.code).emit("room:state", result.data.room);
    } catch {
      removePlayer(result.data.room.code, result.data.playerId, socket.id);
      delete socket.data.playerId;
      delete socket.data.roomCode;
      acknowledge(serverFailure<RoomMembershipData>());
    }
  });

  socket.on("race:start", (payload, acknowledge) => {
    const result = startRace(
      payload,
      socket.data.playerId,
      socket.data.roomCode,
    );

    if (!result.ok) {
      acknowledge(result);
      return;
    }

    const { room, startsAt, endsAt } = result.data;

    io.to(room.code).emit("room:state", room);
    io.to(room.code).emit("race:started", {
      room,
      challenge: publicChallenge,
      startsAt,
      endsAt,
    });
    acknowledge({ ok: true, data: { accepted: true } });

    const activationTimer = setTimeout(
      () => {
        const activeRoom = activateRace(room.code, startsAt);

        if (activeRoom) {
          io.to(room.code).emit("room:state", activeRoom);
        }
      },
      Math.max(0, startsAt - Date.now()),
    );

    activationTimer.unref();
  });

  socket.on("race:submit", (payload, acknowledge) => {
    const result = submitAnswer(
      payload,
      socket.data.playerId,
      socket.data.roomCode,
    );

    if (!result.ok) {
      if (result.error.code === "EVALUATION_FAILED") {
        console.error(
          `Submission evaluation failed in room ${socket.data.roomCode ?? "unknown"}`,
        );
      }

      acknowledge(result);
      return;
    }

    acknowledge({
      ok: true,
      data: {
        submissionId: result.data.submissionId,
        evaluation: result.data.evaluation,
      },
    });
    io.to(result.data.room.code).emit("room:state", result.data.room);
    finishRaceAndBroadcast(io, result.data.room.code);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`);

    const { playerId, roomCode } = socket.data;

    if (!playerId || !roomCode) {
      return;
    }

    const room = removePlayer(roomCode, playerId, socket.id);

    if (room) {
      io.to(room.code).emit("room:state", room);
    }

    finishRaceAndBroadcast(io, roomCode);
  });
}
