import { randomInt, randomUUID } from "node:crypto";

import type {
  AckResult,
  PublicRoomState,
  RoomMembershipData,
  RoomStatus,
} from "@bugrace/shared";
import { z } from "zod";

interface Player {
  id: string;
  socketId: string;
  username: string;
}

interface Room {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: Map<string, Player>;
  startsAt?: number;
  endsAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface RaceStartData {
  room: PublicRoomState;
  startsAt: number;
  endsAt: number;
}

const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCodePattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .refine((username) => !/\p{Cc}/u.test(username));

const roomCodeSchema = z
  .string()
  .trim()
  .transform((roomCode) => roomCode.toUpperCase())
  .pipe(z.string().regex(roomCodePattern));

const createRoomPayloadSchema = z
  .object({
    username: usernameSchema,
  })
  .strict();

const joinRoomPayloadSchema = z
  .object({
    username: usernameSchema,
    roomCode: roomCodeSchema,
  })
  .strict();

const startRacePayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
  })
  .strict();

const rooms = new Map<string, Room>();

function failure<T>(code: string, message: string): AckResult<T> {
  return {
    ok: false,
    error: { code, message },
  };
}

function generateRoomCode(): string {
  let code: string;

  do {
    code = Array.from({ length: 6 }, () =>
      roomCodeAlphabet.charAt(randomInt(roomCodeAlphabet.length)),
    ).join("");
  } while (rooms.has(code));

  return code;
}

export function toPublicRoomState(room: Room): PublicRoomState {
  return {
    code: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      username: player.username,
      isHost: player.id === room.hostPlayerId,
    })),
  };
}

export function createRoom(
  payload: unknown,
  socketId: string,
  alreadyInRoom: boolean,
): AckResult<RoomMembershipData> {
  const parsedPayload = createRoomPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return failure(
      "INVALID_USERNAME",
      "Username must be 2–20 characters and cannot contain control characters.",
    );
  }

  if (alreadyInRoom) {
    return failure("ALREADY_IN_ROOM", "This connection is already in a room.");
  }

  const now = Date.now();
  const player: Player = {
    id: randomUUID(),
    socketId,
    username: parsedPayload.data.username,
  };
  const room: Room = {
    code: generateRoomCode(),
    status: "WAITING",
    hostPlayerId: player.id,
    players: new Map([[player.id, player]]),
    createdAt: now,
    updatedAt: now,
  };

  rooms.set(room.code, room);

  return {
    ok: true,
    data: {
      playerId: player.id,
      room: toPublicRoomState(room),
    },
  };
}

export function joinRoom(
  payload: unknown,
  socketId: string,
  alreadyInRoom: boolean,
): AckResult<RoomMembershipData> {
  const parsedPayload = joinRoomPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    const invalidUsername =
      parsedPayload.error.flatten().fieldErrors.username !== undefined;

    return invalidUsername
      ? failure(
          "INVALID_USERNAME",
          "Username must be 2–20 characters and cannot contain control characters.",
        )
      : failure(
          "INVALID_ROOM_CODE",
          "Room code must contain six valid characters.",
        );
  }

  if (alreadyInRoom) {
    return failure("ALREADY_IN_ROOM", "This connection is already in a room.");
  }

  const room = rooms.get(parsedPayload.data.roomCode);

  if (!room) {
    return failure("ROOM_NOT_FOUND", "Room not found.");
  }

  if (room.status !== "WAITING") {
    return failure("ROOM_NOT_JOINABLE", "This room has already started.");
  }

  const normalizedUsername = parsedPayload.data.username.toLowerCase();
  const usernameTaken = [...room.players.values()].some(
    (player) => player.username.toLowerCase() === normalizedUsername,
  );

  if (usernameTaken) {
    return failure(
      "USERNAME_TAKEN",
      "That username is already taken in this room.",
    );
  }

  const player: Player = {
    id: randomUUID(),
    socketId,
    username: parsedPayload.data.username,
  };

  room.players.set(player.id, player);
  room.updatedAt = Date.now();

  return {
    ok: true,
    data: {
      playerId: player.id,
      room: toPublicRoomState(room),
    },
  };
}

export function startRace(
  payload: unknown,
  playerId: string | undefined,
  roomCode: string | undefined,
): AckResult<RaceStartData> {
  const parsedPayload = startRacePayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return failure(
      "INVALID_ROOM_CODE",
      "Room code must contain six valid characters.",
    );
  }

  if (!playerId || !roomCode) {
    return failure(
      "HOST_OR_ROOM_ERROR",
      "This connection is not associated with a room player.",
    );
  }

  if (parsedPayload.data.roomCode !== roomCode) {
    return failure("ROOM_MISMATCH", "The requested room does not match.");
  }

  const room = rooms.get(roomCode);

  if (!room || !room.players.has(playerId)) {
    return failure(
      "HOST_OR_ROOM_ERROR",
      "This connection is not associated with a room player.",
    );
  }

  if (room.hostPlayerId !== playerId) {
    return failure("HOST_ONLY", "Only the host can start the race.");
  }

  if (room.status !== "WAITING") {
    return failure("INVALID_RACE_STATE", "The race has already started.");
  }

  if (room.players.size < 2) {
    return failure(
      "NOT_ENOUGH_PLAYERS",
      "At least two players are required to start.",
    );
  }

  const startsAt = Date.now() + 3_000;
  const endsAt = startsAt + 120_000;

  // This mutation is intentionally synchronous to prevent double starts.
  room.status = "COUNTDOWN";
  room.startsAt = startsAt;
  room.endsAt = endsAt;
  room.updatedAt = Date.now();

  return {
    ok: true,
    data: {
      room: toPublicRoomState(room),
      startsAt,
      endsAt,
    },
  };
}

export function activateRace(
  roomCode: string,
  expectedStartsAt: number,
): PublicRoomState | null {
  const room = rooms.get(roomCode);

  if (
    !room ||
    room.status !== "COUNTDOWN" ||
    room.startsAt !== expectedStartsAt
  ) {
    return null;
  }

  room.status = "ACTIVE";
  room.updatedAt = Date.now();

  return toPublicRoomState(room);
}

export function removePlayer(
  roomCode: string,
  playerId: string,
  socketId: string,
): PublicRoomState | null {
  const room = rooms.get(roomCode);
  const player = room?.players.get(playerId);

  if (!room || !player || player.socketId !== socketId) {
    return null;
  }

  room.players.delete(playerId);

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return null;
  }

  if (room.status === "WAITING" && room.hostPlayerId === playerId) {
    const nextHost = room.players.values().next().value;

    if (nextHost) {
      room.hostPlayerId = nextHost.id;
    }
  }

  room.updatedAt = Date.now();
  return toPublicRoomState(room);
}
