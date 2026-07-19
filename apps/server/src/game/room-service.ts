import { randomInt, randomUUID } from "node:crypto";

import type {
  AckResult,
  FinalRaceResult,
  PlayerStatus,
  PublicRoomState,
  RaceFinishReason,
  RoomMembershipData,
  RoomStatus,
  ScoreBreakdown,
  SubmissionAcceptedPayload,
  SubmissionEvaluation,
} from "@bugrace/shared";
import { z } from "zod";

import { env } from "../config/env.js";
import { publicChallenge } from "./challenge.js";
import { semanticEvaluationSchema } from "./evaluation-schema.js";
import type { EvaluationInput, SemanticEvaluation } from "./evaluator.js";
import { privateEvaluationData } from "./private-evaluation.js";
import {
  calculateFinalScore,
  createZeroScore,
  deriveCorrectness,
  PUBLIC_SCORING_RULES,
} from "./scoring.js";

interface Player {
  id: string;
  socketId: string;
  username: string;
  status: PlayerStatus;
}

interface Submission {
  id: string;
  playerId: string;
  socketId: string;
  username: string;
  isHost: boolean;
  roomCode: string;
  challengeId: string;
  explanation: string;
  proposedFix: string;
  acceptedAt: number;
  evaluationStartedAt?: number;
  evaluationCompletedAt?: number;
  evaluation?: SemanticEvaluation;
  correct?: boolean;
  score?: ScoreBreakdown;
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
  finishReason?: RaceFinishReason;
  createdAt: number;
  updatedAt: number;
}

interface RaceStartData {
  room: PublicRoomState;
  startsAt: number;
  endsAt: number;
}

export interface SubmissionReservationData extends SubmissionAcceptedPayload {
  playerId: string;
  socketId: string;
  evaluationInput: EvaluationInput;
  room: PublicRoomState;
}

export interface SubmissionCompletionData {
  playerId: string;
  socketId: string;
  submissionId: string;
  evaluation: SubmissionEvaluation;
  room: PublicRoomState;
}

export interface SubmissionFailureData {
  playerId: string;
  socketId: string;
  submissionId: string;
  retryAllowed: boolean;
  room: PublicRoomState;
}

export interface RaceAdvanceData {
  room: PublicRoomState;
  result: FinalRaceResult | null;
  enteredFinalizing: boolean;
  didFinish: boolean;
}

export interface RaceDeadlineState {
  status: RoomStatus;
  endsAt: number | undefined;
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

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return value;
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
  const endsAt = startsAt + env.RACE_DURATION_MS;

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

export function reserveSubmission(
  payload: unknown,
  playerId: string | undefined,
  socketRoomCode: string | undefined,
  receivedAt = Date.now(),
): AckResult<SubmissionReservationData> {
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

  if (
    room.status === "FINISHED" &&
    room.finalResult?.finishReason === "DEADLINE_REACHED"
  ) {
    return failure("RACE_ENDED", "The race deadline has passed.");
  }

  if (room.status !== "ACTIVE") {
    return failure("RACE_NOT_ACTIVE", "The race is not active.");
  }

  if (room.startsAt === undefined || room.endsAt === undefined) {
    return failure("RACE_NOT_STARTED", "The race has not started.");
  }

  if (receivedAt < room.startsAt) {
    return failure("RACE_NOT_STARTED", "The race has not started.");
  }

  if (receivedAt >= room.endsAt) {
    return failure("RACE_ENDED", "The race deadline has passed.");
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
    socketId: player.socketId,
    username: player.username,
    isHost: player.id === room.hostPlayerId,
    roomCode: room.code,
    challengeId: publicChallenge.id,
    explanation: parsedPayload.data.explanation,
    proposedFix: parsedPayload.data.proposedFix,
    acceptedAt: receivedAt,
  };

  // Reserve synchronously so rapid duplicate events cannot evaluate twice.
  room.submissions.set(playerId, submission);
  player.status = "EVALUATING";
  room.updatedAt = receivedAt;

  return {
    ok: true,
    data: {
      submissionId,
      acceptedAt: receivedAt,
      status: "EVALUATING",
      playerId,
      socketId: player.socketId,
      evaluationInput: {
        challenge: {
          title: publicChallenge.title,
          scenario: publicChallenge.scenario,
          language: publicChallenge.language,
          buggyCode: publicChallenge.buggyCode,
        },
        rubric: {
          rootCause: privateEvaluationData.rootCause,
          referenceFix: privateEvaluationData.referenceFix,
          requiredConcepts: [...privateEvaluationData.requiredConcepts],
        },
        submission: {
          explanation: submission.explanation,
          proposedFix: submission.proposedFix,
        },
      },
      room: toPublicRoomState(room),
    },
  };
}

export function markSubmissionEvaluationStarted(
  roomCode: string,
  playerId: string,
  submissionId: string,
  startedAt = Date.now(),
): boolean {
  const submission = rooms.get(roomCode)?.submissions.get(playerId);

  if (!submission || submission.id !== submissionId || submission.evaluation) {
    return false;
  }

  submission.evaluationStartedAt = startedAt;
  return true;
}

export function completeSubmissionEvaluation(
  roomCode: string,
  playerId: string,
  submissionId: string,
  untrustedEvaluation: SemanticEvaluation,
  completedAt = Date.now(),
): SubmissionCompletionData | null {
  const room = rooms.get(roomCode);
  const submission = room?.submissions.get(playerId);

  if (
    !room ||
    !submission ||
    submission.id !== submissionId ||
    submission.evaluation
  ) {
    return null;
  }

  const parsedEvaluation =
    semanticEvaluationSchema.safeParse(untrustedEvaluation);

  if (!parsedEvaluation.success) {
    return null;
  }

  const evaluation: SemanticEvaluation = parsedEvaluation.data;
  const correct = deriveCorrectness(evaluation);
  const score = calculateFinalScore({
    correct,
    rootCauseScore: evaluation.rootCauseScore,
    fixScore: evaluation.fixScore,
    reasoningScore: evaluation.reasoningScore,
    acceptedAt: submission.acceptedAt,
    startsAt: room.startsAt ?? submission.acceptedAt,
    endsAt: room.endsAt ?? submission.acceptedAt,
    hintsUsed: 0,
  });

  Object.assign(submission, {
    evaluation,
    correct,
    score,
    evaluationCompletedAt: completedAt,
  });

  const player = room.players.get(playerId);
  if (player?.status === "EVALUATING") {
    player.status = "SUBMITTED";
  }
  room.updatedAt = completedAt;

  return {
    playerId,
    socketId: submission.socketId,
    submissionId,
    evaluation: {
      correct,
      score,
      evaluation: {
        source: evaluation.source,
        confidence: evaluation.confidence,
        feedback: evaluation.feedback,
        detectedConcepts: [...evaluation.detectedConcepts],
        missingConcepts: [...evaluation.missingConcepts],
      },
    },
    room: toPublicRoomState(room),
  };
}

export function failSubmissionEvaluation(
  roomCode: string,
  playerId: string,
  submissionId: string,
  failedAt = Date.now(),
): SubmissionFailureData | null {
  const room = rooms.get(roomCode);
  const submission = room?.submissions.get(playerId);

  if (!room || !submission || submission.id !== submissionId) {
    return null;
  }

  const player = room.players.get(playerId);
  const retryAllowed =
    room.status === "ACTIVE" &&
    room.endsAt !== undefined &&
    failedAt < room.endsAt &&
    player?.status === "EVALUATING";

  if (retryAllowed && player) {
    room.submissions.delete(playerId);
    player.status = "SOLVING";
    room.updatedAt = failedAt;
  }

  return {
    playerId,
    socketId: submission.socketId,
    submissionId,
    retryAllowed,
    room: toPublicRoomState(room),
  };
}

function decideRaceClosure(room: Room, now: number): RaceFinishReason | null {
  if (room.status !== "ACTIVE" || room.endsAt === undefined) {
    return null;
  }

  const eligiblePlayers = [...room.players.values()];

  if (eligiblePlayers.length === 0) {
    return null;
  }

  if (
    eligiblePlayers.every(
      (player) =>
        player.status === "EVALUATING" || player.status === "SUBMITTED",
    )
  ) {
    return "ALL_SUBMITTED";
  }

  return now >= room.endsAt ? "DEADLINE_REACHED" : null;
}

export function getRaceDeadlineState(
  roomCode: string,
): RaceDeadlineState | null {
  const room = rooms.get(roomCode);

  return room ? { status: room.status, endsAt: room.endsAt } : null;
}

function canFinalizeResults(room: Room): boolean {
  if (room.status !== "FINALIZING" || room.players.size === 0) {
    return false;
  }

  const playersAreTerminal = [...room.players.values()].every(
    (player) =>
      player.status === "SUBMITTED" || player.status === "TIME_EXPIRED",
  );
  const submissionsAreTerminal = [...room.submissions.values()].every(
    (submission) =>
      submission.evaluation !== undefined &&
      submission.correct !== undefined &&
      submission.score !== undefined,
  );

  return playersAreTerminal && submissionsAreTerminal;
}

export function advanceRaceState(
  roomCode: string,
  now = Date.now(),
): RaceAdvanceData | null {
  const room = rooms.get(roomCode);

  if (!room) {
    return null;
  }

  if (room.status === "FINISHED") {
    return room.finalResult
      ? {
          room: toPublicRoomState(room),
          result: room.finalResult,
          enteredFinalizing: false,
          didFinish: false,
        }
      : null;
  }

  let enteredFinalizing = false;

  if (room.status === "ACTIVE") {
    const finishReason = decideRaceClosure(room, now);

    if (!finishReason) {
      return {
        room: toPublicRoomState(room),
        result: null,
        enteredFinalizing: false,
        didFinish: false,
      };
    }

    room.status = "FINALIZING";
    room.finishReason = finishReason;
    room.updatedAt = now;
    enteredFinalizing = true;

    if (finishReason === "DEADLINE_REACHED") {
      for (const player of room.players.values()) {
        if (player.status === "SOLVING") {
          player.status = "TIME_EXPIRED";
        }
      }
    }
  }

  if (!canFinalizeResults(room)) {
    return {
      room: toPublicRoomState(room),
      result: null,
      enteredFinalizing,
      didFinish: false,
    };
  }

  if (
    room.startsAt === undefined ||
    room.endsAt === undefined ||
    !room.finishReason
  ) {
    return null;
  }

  const startsAt = room.startsAt;
  const endsAt = room.endsAt;
  const finishReason = room.finishReason;

  room.status = "FINISHED";
  room.finishedAt = now;
  room.updatedAt = now;

  const submittedEntries = [...room.submissions.values()]
    .sort((first, second) => {
      if (first.correct !== second.correct) {
        return Number(second.correct ?? false) - Number(first.correct ?? false);
      }

      if (first.score?.finalScore !== second.score?.finalScore) {
        return (second.score?.finalScore ?? 0) - (first.score?.finalScore ?? 0);
      }

      if (first.score?.semanticSubtotal !== second.score?.semanticSubtotal) {
        return (
          (second.score?.semanticSubtotal ?? 0) -
          (first.score?.semanticSubtotal ?? 0)
        );
      }

      if (first.acceptedAt !== second.acceptedAt) {
        return first.acceptedAt - second.acceptedAt;
      }

      const usernameComparison = first.username.localeCompare(second.username);

      return usernameComparison !== 0
        ? usernameComparison
        : first.playerId.localeCompare(second.playerId);
    })
    .map((submission) => ({
      playerId: submission.playerId,
      username: submission.username,
      isHost: submission.isHost,
      outcome: "SUBMITTED" as const,
      correct: submission.correct ?? false,
      acceptedAt: submission.acceptedAt,
      elapsedMs: Math.max(0, submission.acceptedAt - startsAt),
      score: submission.score ?? createZeroScore(),
      evaluation: submission.evaluation
        ? {
            source: submission.evaluation.source,
            confidence: submission.evaluation.confidence,
            feedback: submission.evaluation.feedback,
            detectedConcepts: [...submission.evaluation.detectedConcepts],
            missingConcepts: [...submission.evaluation.missingConcepts],
          }
        : null,
    }));

  const timedOutEntries = [...room.players.values()]
    .filter((player) => player.status === "TIME_EXPIRED")
    .sort((first, second) => first.username.localeCompare(second.username))
    .map((player) => ({
      playerId: player.id,
      username: player.username,
      isHost: player.id === room.hostPlayerId,
      outcome: "TIME_EXPIRED" as const,
      correct: null,
      acceptedAt: null,
      elapsedMs: null,
      score: createZeroScore(),
      evaluation: null,
    }));

  const leaderboard = [...submittedEntries, ...timedOutEntries].map(
    (entry, index) => ({
      rank: index + 1,
      ...entry,
    }),
  );

  const result: FinalRaceResult = {
    roomCode: room.code,
    challengeId: publicChallenge.id,
    startsAt,
    endsAt,
    finishedAt: now,
    finishReason,
    scoringRules: PUBLIC_SCORING_RULES,
    leaderboard,
    referenceAnswer: {
      rootCause: privateEvaluationData.rootCause,
      referenceFix: privateEvaluationData.referenceFix,
      requiredConcepts: [...privateEvaluationData.requiredConcepts],
    },
  };

  room.finalResult = deepFreeze(result);

  return {
    room: toPublicRoomState(room),
    result: room.finalResult,
    enteredFinalizing,
    didFinish: true,
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
