export interface ConnectionReadyPayload {
  socketId: string;
  connectedAt: string;
}

export interface ConnectionPingPayload {
  sentAt: string;
}

export interface ConnectionPingAcknowledgement {
  ok: true;
  receivedAt: string;
}

export type RoomStatus =
  "WAITING" | "COUNTDOWN" | "ACTIVE" | "FINALIZING" | "FINISHED";

export type PlayerStatus =
  "LOBBY" | "SOLVING" | "EVALUATING" | "SUBMITTED" | "TIME_EXPIRED";

export type RaceFinishReason = "ALL_SUBMITTED" | "DEADLINE_REACHED";

export type ParticipantOutcome = "SUBMITTED" | "TIME_EXPIRED";

export type EvaluationSource = "OPENAI" | "MOCK" | "MOCK_FALLBACK";

export interface ScoreBreakdown {
  rootCauseScore: number;
  fixScore: number;
  reasoningScore: number;
  semanticSubtotal: number;
  speedScore: number;
  hintsUsed: number;
  hintPenalty: number;
  incorrectAnswerCapApplied: boolean;
  finalScore: number;
  maximumScore: 100;
}

export interface PublicEvaluation {
  source: EvaluationSource;
  confidence: number;
  feedback: string;
  detectedConcepts: string[];
  missingConcepts: string[];
}

export interface PublicPlayer {
  id: string;
  username: string;
  isHost: boolean;
  status: PlayerStatus;
}

export interface PublicRoomState {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: PublicPlayer[];
}

export interface PublicChallenge {
  id: string;
  title: string;
  scenario: string;
  language: "typescript";
  buggyCode: string;
}

export type AckResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface RoomMembershipData {
  playerId: string;
  room: PublicRoomState;
}

export interface RaceStartedPayload {
  room: PublicRoomState;
  challenge: PublicChallenge;
  startsAt: number;
  endsAt: number;
}

export interface SubmitAnswerPayload {
  roomCode: string;
  explanation: string;
  proposedFix: string;
}

export interface SubmissionEvaluation {
  correct: boolean;
  score: ScoreBreakdown;
  evaluation: PublicEvaluation;
}

export interface SubmissionAcceptedPayload {
  submissionId: string;
  acceptedAt: number;
  status: "EVALUATING";
}

export interface SubmissionEvaluatedPayload extends SubmissionEvaluation {
  submissionId: string;
}

export interface SubmissionEvaluationFailedPayload {
  submissionId: string;
  code:
    | "EVALUATION_TIMEOUT"
    | "EVALUATION_REFUSED"
    | "EVALUATION_INVALID"
    | "EVALUATION_UNAVAILABLE";
  message: string;
  retryAllowed: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  isHost: boolean;
  outcome: ParticipantOutcome;
  correct: boolean | null;
  acceptedAt: number | null;
  elapsedMs: number | null;
  score: ScoreBreakdown;
  evaluation: PublicEvaluation | null;
}

export interface FinalRaceResult {
  roomCode: string;
  challengeId: string;
  startsAt: number;
  endsAt: number;
  finishedAt: number;
  finishReason: RaceFinishReason;
  scoringRules: {
    maximumScore: 100;
    speedMaximum: 10;
    incorrectAnswerCap: 40;
    penaltyPerHint: 5;
  };
  leaderboard: LeaderboardEntry[];
  referenceAnswer: {
    rootCause: string;
    referenceFix: string;
    requiredConcepts: string[];
  };
}

export interface ServerToClientEvents {
  "connection:ready": (payload: ConnectionReadyPayload) => void;
  "room:state": (room: PublicRoomState) => void;
  "race:started": (payload: RaceStartedPayload) => void;
  "submission:evaluated": (payload: SubmissionEvaluatedPayload) => void;
  "submission:evaluation-failed": (
    payload: SubmissionEvaluationFailedPayload,
  ) => void;
  "race:finished": (result: FinalRaceResult) => void;
}

export interface ClientToServerEvents {
  "connection:ping": (
    payload: ConnectionPingPayload,
    acknowledge: (response: ConnectionPingAcknowledgement) => void,
  ) => void;
  "room:create": (
    payload: { username: string },
    acknowledge: (response: AckResult<RoomMembershipData>) => void,
  ) => void;
  "room:join": (
    payload: { username: string; roomCode: string },
    acknowledge: (response: AckResult<RoomMembershipData>) => void,
  ) => void;
  "race:start": (
    payload: { roomCode: string },
    acknowledge: (response: AckResult<{ accepted: true }>) => void,
  ) => void;
  "race:submit": (
    payload: SubmitAnswerPayload,
    acknowledge: (response: AckResult<SubmissionAcceptedPayload>) => void,
  ) => void;
}
