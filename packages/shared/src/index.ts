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

export type RoomStatus = "WAITING" | "COUNTDOWN" | "ACTIVE" | "FINISHED";

export type PlayerStatus = "LOBBY" | "SOLVING" | "SUBMITTED";

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
  rootCauseScore: number;
  fixScore: number;
  reasoningScore: number;
  finalScore: number;
  feedback: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  correct: boolean;
  rootCauseScore: number;
  fixScore: number;
  reasoningScore: number;
  finalScore: number;
  submittedAt: number;
}

export interface FinalRaceResult {
  roomCode: string;
  challengeId: string;
  finishedAt: number;
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
    acknowledge: (
      response: AckResult<{
        submissionId: string;
        evaluation: SubmissionEvaluation;
      }>,
    ) => void,
  ) => void;
}
