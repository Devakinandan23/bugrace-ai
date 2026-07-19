import { randomInt, randomUUID } from "node:crypto";

import type {
  AckResult,
  FinalRaceResult,
  PlayerStatus,
  PublicRoomState,
  RoomMembershipData,
  RoomStatus,
  SubmissionEvaluation,
} from "@bugrace/shared";
import { z } from "zod";

import { publicChallenge } from "./challenge.js";
import { mockSubmissionEvaluator } from "./mock-evaluator.js";
import { privateEvaluationData } from "./private-evaluation.js";
import { calculateFinalScore, clampScore } from "./scoring.js";

interface Player {
  id: string;
  socketId: string;
  username: string;
  status: PlayerStatus;
}

interface Submission {
  id: string;
  playerId: string;
  username: string;
  roomCode: string;
  challengeId: string;
  explanation: string;
  proposedFix: string;
  correct: boolean;
  rootCauseScore: number;
  fixScore: number;
  reasoningScore: number;
  finalScore: number;
  feedback: string;
  submittedAt: number;
}

interface Room {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: Map<string, Player>;
  submissions: Map<string, Submission>;
  startsAt?: number;
  endsAt?: number;
  finishedAt?: number;
  finalResult?: FinalRaceResult;
  createdAt: number;
  updatedAt: number;
}

interface RaceStartData {
  room: PublicRoomState;
  startsAt: number;
  endsAt: number;
}

interface SubmissionAcceptanceData {
  submissionId: string;
  evaluation: SubmissionEvaluation;
  room: PublicRoomState;
}

interface RaceCompletionData {
  room: PublicRoomState;
  result: FinalRaceResult;
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

function hasDisallowedControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);

    return (
      codePoint !== undefined &&
      ((codePoint < 32 && ![9, 10, 13].includes(codePoint)) ||
        codePoint === 127)
    );
  });
}

const submissionPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    explanation: z
      .string()
      .trim()
      .min(10)
      .max(2_000)
      .refine((value) => !hasDisallowedControlCharacter(value)),
    proposedFix: z
      .string()
      .trim()
      .min(1)
      .max(4_000)
      .refine((value) => !hasDisallowedControlCharacter(value)),
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
      status: player.status,
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
    status: "LOBBY",
  };
  const room: Room = {
    code: generateRoomCode(),
    status: "WAITING",
    hostPlayerId: player.id,
    players: new Map([[player.id, player]]),
    submissions: new Map(),
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
    status: "LOBBY",
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
  for (const player of room.players.values()) {
    player.status = "SOLVING";
  }
  room.updatedAt = Date.now();

  return toPublicRoomState(room);
}

export function submitAnswer(
  payload: unknown,
  playerId: string | undefined,
  socketRoomCode: string | undefined,
): AckResult<SubmissionAcceptanceData> {
  const parsedPayload = submissionPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return failure(
      "INVALID_SUBMISSION",
      "Enter an explanation of 10–2,000 characters and a proposed fix of up to 4,000 characters.",
    );
  }

  if (!playerId || !socketRoomCode) {
    return failure(
      "PLAYER_NOT_IN_ROOM",
      "This connection is not associated with a room player.",
    );
  }

  if (parsedPayload.data.roomCode !== socketRoomCode) {
    return failure("ROOM_MISMATCH", "The submitted room does not match.");
  }

  const room = rooms.get(socketRoomCode);

  if (!room) {
    return failure("ROOM_NOT_FOUND", "Room not found.");
  }

  const player = room.players.get(playerId);

  if (!player) {
    return failure(
      "PLAYER_NOT_IN_ROOM",
      "This player no longer belongs to the room.",
    );
  }

  if (room.status !== "ACTIVE") {
    return failure("RACE_NOT_ACTIVE", "The race is not active.");
  }

  if (room.startsAt === undefined || room.endsAt === undefined) {
    return failure("RACE_NOT_STARTED", "The race has not started.");
  }

  const submittedAt = Date.now();

  if (submittedAt < room.startsAt) {
    return failure("RACE_NOT_STARTED", "The race has not started.");
  }

  if (submittedAt >= room.endsAt) {
    return failure(
      "SUBMISSION_TOO_LATE",
      "The submission deadline has passed.",
    );
  }

  if (room.submissions.has(playerId)) {
    return failure(
      "ALREADY_SUBMITTED",
      "This player has already submitted an answer.",
    );
  }

  if (player.status !== "SOLVING") {
    return failure(
      "INVALID_PLAYER_STATE",
      "This player cannot submit in their current state.",
    );
  }

  const submissionId = randomUUID();
  const submission: Submission = {
    id: submissionId,
    playerId,
    username: player.username,
    roomCode: room.code,
    challengeId: publicChallenge.id,
    explanation: parsedPayload.data.explanation,
    proposedFix: parsedPayload.data.proposedFix,
    correct: false,
    rootCauseScore: 0,
    fixScore: 0,
    reasoningScore: 0,
    finalScore: 0,
    feedback: "",
    submittedAt,
  };

  // Reserve synchronously so rapid duplicate events cannot evaluate twice.
  room.submissions.set(playerId, submission);

  try {
    const evaluation = mockSubmissionEvaluator.evaluate({
      explanation: submission.explanation,
      proposedFix: submission.proposedFix,
    });
    const rootCauseScore = clampScore(evaluation.rootCauseScore, 35);
    const fixScore = clampScore(evaluation.fixScore, 35);
    const reasoningScore = clampScore(evaluation.reasoningScore, 15);
    const finalScore = calculateFinalScore({
      rootCauseScore,
      fixScore,
      reasoningScore,
    });

    Object.assign(submission, {
      correct: evaluation.correct,
      rootCauseScore,
      fixScore,
      reasoningScore,
      finalScore,
      feedback: evaluation.feedback,
    });

    player.status = "SUBMITTED";
    room.updatedAt = Date.now();

    return {
      ok: true,
      data: {
        submissionId,
        evaluation: {
          correct: submission.correct,
          rootCauseScore,
          fixScore,
          reasoningScore,
          finalScore,
          feedback: submission.feedback,
        },
        room: toPublicRoomState(room),
      },
    };
  } catch {
    room.submissions.delete(playerId);
    return failure(
      "EVALUATION_FAILED",
      "The submission could not be evaluated. Please try again.",
    );
  }
}

export function finishRaceIfReady(roomCode: string): RaceCompletionData | null {
  const room = rooms.get(roomCode);

  if (!room || room.status !== "ACTIVE") {
    return null;
  }

  const connectedPlayers = [...room.players.values()];

  if (
    connectedPlayers.length === 0 ||
    !connectedPlayers.every((player) => player.status === "SUBMITTED")
  ) {
    return null;
  }

  const finishedAt = Date.now();
  room.status = "FINISHED";
  room.finishedAt = finishedAt;
  room.updatedAt = finishedAt;

  const leaderboard = [...room.submissions.values()]
    .sort((first, second) => {
      if (first.correct !== second.correct) {
        return Number(second.correct) - Number(first.correct);
      }

      if (first.finalScore !== second.finalScore) {
        return second.finalScore - first.finalScore;
      }

      if (first.submittedAt !== second.submittedAt) {
        return first.submittedAt - second.submittedAt;
      }

      return first.username.localeCompare(second.username);
    })
    .map((submission, index) => ({
      rank: index + 1,
      playerId: submission.playerId,
      username: submission.username,
      correct: submission.correct,
      rootCauseScore: submission.rootCauseScore,
      fixScore: submission.fixScore,
      reasoningScore: submission.reasoningScore,
      finalScore: submission.finalScore,
      submittedAt: submission.submittedAt,
    }));

  const result: FinalRaceResult = {
    roomCode: room.code,
    challengeId: publicChallenge.id,
    finishedAt,
    leaderboard,
    referenceAnswer: {
      rootCause: privateEvaluationData.rootCause,
      referenceFix: privateEvaluationData.referenceFix,
      requiredConcepts: [...privateEvaluationData.requiredConcepts],
    },
  };

  room.finalResult = result;

  return {
    room: toPublicRoomState(room),
    result,
  };
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
