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
  EvaluationError,
  type EvaluationFailureCode,
  type SubmissionEvaluator,
} from "../game/evaluator.js";
import {
  advanceRace,
  clearRaceDeadline,
  scheduleRaceDeadline,
} from "../game/race-deadline.js";
import {
  activateRace,
  completeSubmissionEvaluation,
  createRoom,
  failSubmissionEvaluation,
  joinRoom,
  markSubmissionEvaluationStarted,
  removePlayer,
  reserveSubmission,
  startRace,
  type SubmissionReservationData,
} from "../game/room-service.js";

export interface SocketData {
  playerId?: string;
  roomCode?: string;
}

export type BugRaceServer = Server<
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

function normalizeEvaluationFailure(error: unknown): EvaluationFailureCode {
  return error instanceof EvaluationError
    ? error.code
    : "EVALUATION_UNAVAILABLE";
}

async function evaluateReservedSubmission(
  io: BugRaceServer,
  evaluator: SubmissionEvaluator,
  roomCode: string,
  reservation: SubmissionReservationData,
): Promise<void> {
  const startedAt = Date.now();
  markSubmissionEvaluationStarted(
    roomCode,
    reservation.playerId,
    reservation.submissionId,
    startedAt,
  );

  try {
    const semanticEvaluation = await evaluator.evaluate(
      reservation.evaluationInput,
    );
    const completedAt = Date.now();
    const completion = completeSubmissionEvaluation(
      roomCode,
      reservation.playerId,
      reservation.submissionId,
      semanticEvaluation,
      completedAt,
    );

    if (!completion) {
      console.error(
        `Evaluation discarded submission=${reservation.submissionId} challenge=${publicChallenge.id} category=invalid-state`,
      );
      return;
    }

    console.log(
      `Evaluation completed submission=${completion.submissionId} challenge=${publicChallenge.id} source=${completion.evaluation.evaluation.source} durationMs=${completedAt - startedAt}`,
    );
    io.to(completion.socketId).emit("submission:evaluated", {
      submissionId: completion.submissionId,
      ...completion.evaluation,
    });
    io.to(roomCode).emit("room:state", completion.room);
    advanceRace(io, roomCode, completedAt);
  } catch (error) {
    const failedAt = Date.now();
    const failureCode = normalizeEvaluationFailure(error);
    const failure = failSubmissionEvaluation(
      roomCode,
      reservation.playerId,
      reservation.submissionId,
      failedAt,
    );

    console.error(
      `Evaluation failed submission=${reservation.submissionId} challenge=${publicChallenge.id} category=${failureCode} durationMs=${failedAt - startedAt}`,
    );

    if (!failure) {
      return;
    }

    io.to(failure.socketId).emit("submission:evaluation-failed", {
      submissionId: failure.submissionId,
      code: failureCode,
      message: failure.retryAllowed
        ? "Evaluation failed. You can submit again before the deadline."
        : "Evaluation failed after submissions closed.",
      retryAllowed: failure.retryAllowed,
    });
    io.to(roomCode).emit("room:state", failure.room);
    advanceRace(io, roomCode, failedAt);
  }
}

export function registerSocketHandlers(
  io: BugRaceServer,
  socket: BugRaceSocket,
  evaluator: SubmissionEvaluator,
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
    scheduleRaceDeadline(io, room.code, endsAt);

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
    const receivedAt = Date.now();
    const result = reserveSubmission(
      payload,
      socket.data.playerId,
      socket.data.roomCode,
      receivedAt,
    );

    if (!result.ok) {
      if (result.error.code === "RACE_ENDED" && socket.data.roomCode) {
        advanceRace(io, socket.data.roomCode, receivedAt);
      }

      acknowledge(result);
      return;
    }

    acknowledge({
      ok: true,
      data: {
        submissionId: result.data.submissionId,
        acceptedAt: result.data.acceptedAt,
        status: result.data.status,
      },
    });
    io.to(result.data.room.code).emit("room:state", result.data.room);
    advanceRace(io, result.data.room.code, receivedAt);
    void evaluateReservedSubmission(
      io,
      evaluator,
      result.data.room.code,
      result.data,
    );
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
    } else {
      clearRaceDeadline(roomCode);
    }

    advanceRace(io, roomCode);
  });
}
