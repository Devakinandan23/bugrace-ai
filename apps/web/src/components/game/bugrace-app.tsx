"use client";

import type {
  ChallengeFallbackPayload,
  FinalRaceResult,
  PublicRoomState,
  RaceStartedPayload,
  SubmissionEvaluatedPayload,
  SubmissionEvaluation,
  SubmissionEvaluationFailedPayload,
} from "@bugrace/shared";
import { useEffect, useRef, useState } from "react";

import { socket } from "@/lib/socket";

import {
  ConnectionStatus,
  type ConnectionState,
  type PingState,
} from "./connection-status";
import { HomeScreen } from "./home-screen";
import { LobbyScreen } from "./lobby-screen";
import { RaceScreen } from "./race-screen";
import { ResultsScreen } from "./results-screen";

type PendingAction = "create" | "join" | "start" | "submit";
type GameScreen = "HOME" | "LOBBY" | "RACE" | "RESULTS";

const acknowledgementTimeoutMs = 5_000;
const rememberedUsernameKey = "bugrace:username";

function isValidUsername(username: string): boolean {
  const trimmedUsername = username.trim();

  return (
    trimmedUsername.length >= 2 &&
    trimmedUsername.length <= 20 &&
    !/\p{Cc}/u.test(trimmedUsername)
  );
}

function rememberUsername(username: string): void {
  try {
    window.localStorage.setItem(rememberedUsernameKey, username);
  } catch {
    // Browser storage is optional; room entry still works without it.
  }
}

export function getGameScreen(room: PublicRoomState | null): GameScreen {
  if (!room) {
    return "HOME";
  }

  if (room.status === "FINISHED") {
    return "RESULTS";
  }

  if (room.status === "WAITING" || room.status === "PREPARING") {
    return "LOBBY";
  }

  return "RACE";
}

export function BugRaceApp() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("Connecting");
  const [socketId, setSocketId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pingState, setPingState] = useState<PingState>({ status: "idle" });
  const [username, setUsername] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [race, setRace] = useState<RaceStartedPayload | null>(null);
  const [explanation, setExplanation] = useState("");
  const [proposedFix, setProposedFix] = useState("");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [ownEvaluation, setOwnEvaluation] =
    useState<SubmissionEvaluation | null>(null);
  const [acceptedSubmissionId, setAcceptedSubmissionId] = useState<
    string | null
  >(null);
  const [finalResult, setFinalResult] = useState<FinalRaceResult | null>(null);
  const [requestAiChallenge, setRequestAiChallenge] = useState(false);
  const [challengeNotice, setChallengeNotice] = useState<string | null>(null);
  const [serverDeadlineRejected, setServerDeadlineRejected] = useState(false);
  const [serverClock, setServerClock] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const pingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestId = useRef(0);
  const actionPending = useRef(false);
  const resettingForNewRace = useRef(false);

  useEffect(() => {
    try {
      const rememberedUsername = window.localStorage.getItem(
        rememberedUsernameKey,
      );

      if (rememberedUsername && isValidUsername(rememberedUsername)) {
        const restoreTimer = window.setTimeout(
          () => setUsername(rememberedUsername),
          0,
        );

        return () => window.clearTimeout(restoreTimer);
      }
    } catch {
      // Browser storage is optional; room entry still works without it.
    }
  }, []);

  useEffect(() => {
    const cancelPendingAction = () => {
      activeRequestId.current += 1;
      actionPending.current = false;
      setPendingAction(null);

      if (actionTimeout.current) {
        clearTimeout(actionTimeout.current);
        actionTimeout.current = null;
      }
    };

    const clearRaceState = () => {
      setPlayerId(null);
      setRoom(null);
      setRace(null);
      setExplanation("");
      setProposedFix("");
      setOwnEvaluation(null);
      setAcceptedSubmissionId(null);
      setFinalResult(null);
      setChallengeNotice(null);
      setServerDeadlineRejected(false);
      setSubmissionError(null);
      setServerClock(0);
      setCopyFeedback(null);
    };

    const handleConnect = () => {
      resettingForNewRace.current = false;
      setConnectionState("Connected");
      setSocketId(socket.id ?? null);
      setConnectionError(null);
      setActionError(null);
    };

    const handleDisconnect = () => {
      cancelPendingAction();
      setConnectionState("Disconnected");
      setSocketId(null);
      clearRaceState();

      if (!resettingForNewRace.current) {
        setActionError("Socket disconnected. Reconnect before joining a room.");
      }
    };

    const handleConnectError = () => {
      setConnectionState("Connection error");
      setConnectionError("Unable to connect to the backend.");
      setSocketId(null);
    };

    const handleConnectionReady = (payload: { socketId: string }) => {
      setSocketId(payload.socketId);
    };

    const handleRoomState = (nextRoom: PublicRoomState) => {
      setRoom(nextRoom);
    };

    const handleRaceStarted = (payload: RaceStartedPayload) => {
      setRoom(payload.room);
      setRace(payload);
      setExplanation("");
      setProposedFix("");
      setOwnEvaluation(null);
      setAcceptedSubmissionId(null);
      setFinalResult(null);
      setChallengeNotice(null);
      setServerDeadlineRejected(false);
      setSubmissionError(null);
      setServerClock(Date.now());
      setActionError(null);
    };

    const handleRaceFinished = (result: FinalRaceResult) => {
      setFinalResult(result);
      setRoom((currentRoom) =>
        currentRoom ? { ...currentRoom, status: "FINISHED" } : currentRoom,
      );
      setServerDeadlineRejected(result.finishReason === "DEADLINE_REACHED");
      setSubmissionError(null);
      setServerClock(Date.now());
    };

    const handleChallengeFallback = (payload: ChallengeFallbackPayload) => {
      setChallengeNotice(payload.message);
    };

    const handleSubmissionEvaluated = (payload: SubmissionEvaluatedPayload) => {
      setAcceptedSubmissionId(payload.submissionId);
      setOwnEvaluation({
        correct: payload.correct,
        score: payload.score,
        evaluation: payload.evaluation,
      });
      setSubmissionError(null);
    };

    const handleSubmissionEvaluationFailed = (
      payload: SubmissionEvaluationFailedPayload,
    ) => {
      setAcceptedSubmissionId(
        payload.retryAllowed ? null : payload.submissionId,
      );
      setSubmissionError(payload.message);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("connection:ready", handleConnectionReady);
    socket.on("room:state", handleRoomState);
    socket.on("race:started", handleRaceStarted);
    socket.on("race:challenge-fallback", handleChallengeFallback);
    socket.on("submission:evaluated", handleSubmissionEvaluated);
    socket.on("submission:evaluation-failed", handleSubmissionEvaluationFailed);
    socket.on("race:finished", handleRaceFinished);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("connection:ready", handleConnectionReady);
      socket.off("room:state", handleRoomState);
      socket.off("race:started", handleRaceStarted);
      socket.off("race:challenge-fallback", handleChallengeFallback);
      socket.off("submission:evaluated", handleSubmissionEvaluated);
      socket.off(
        "submission:evaluation-failed",
        handleSubmissionEvaluationFailed,
      );
      socket.off("race:finished", handleRaceFinished);
      socket.disconnect();
      activeRequestId.current += 1;
      actionPending.current = false;

      if (pingTimeout.current) {
        clearTimeout(pingTimeout.current);
      }

      if (actionTimeout.current) {
        clearTimeout(actionTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!race || finalResult) {
      return;
    }

    const clockTimer = setInterval(() => {
      setServerClock(Date.now());
    }, 250);

    return () => clearInterval(clockTimer);
  }, [race, finalResult]);

  const clearActionTimeout = () => {
    if (actionTimeout.current) {
      clearTimeout(actionTimeout.current);
      actionTimeout.current = null;
    }
  };

  const beginAcknowledgedAction = (
    action: PendingAction,
  ): (() => boolean) | null => {
    if (actionPending.current) {
      return null;
    }

    actionPending.current = true;
    setPendingAction(action);
    if (action === "submit") {
      setSubmissionError(null);
    } else {
      setActionError(null);
    }

    const requestId = activeRequestId.current + 1;
    activeRequestId.current = requestId;

    actionTimeout.current = setTimeout(() => {
      if (activeRequestId.current !== requestId) {
        return;
      }

      activeRequestId.current += 1;
      actionPending.current = false;
      actionTimeout.current = null;
      setPendingAction(null);
      if (action === "submit") {
        setSubmissionError("The server did not confirm your submission.");
      } else {
        setActionError("Server acknowledgement timed out.");
      }
    }, acknowledgementTimeoutMs);

    return () => {
      if (activeRequestId.current !== requestId) {
        return false;
      }

      activeRequestId.current += 1;
      actionPending.current = false;
      setPendingAction(null);
      clearActionTimeout();

      return true;
    };
  };

  const requireConnectedSocket = (): boolean => {
    if (socket.connected) {
      return true;
    }

    setActionError("Socket disconnected. Reconnect before using room actions.");
    return false;
  };

  const validateUsername = (): string | null => {
    if (!isValidUsername(username)) {
      setActionError(
        "Invalid username. Use 2–20 characters without control characters.",
      );
      return null;
    }

    return username.trim();
  };

  const clearCompletedRace = () => {
    setRace(null);
    setExplanation("");
    setProposedFix("");
    setOwnEvaluation(null);
    setAcceptedSubmissionId(null);
    setFinalResult(null);
    setChallengeNotice(null);
    setServerDeadlineRejected(false);
    setSubmissionError(null);
    setServerClock(0);
    setCopyFeedback(null);
  };

  const createRoom = () => {
    if (!requireConnectedSocket()) {
      return;
    }

    const normalizedUsername = validateUsername();

    if (!normalizedUsername) {
      return;
    }

    const complete = beginAcknowledgedAction("create");

    if (!complete) {
      return;
    }

    socket.emit("room:create", { username: normalizedUsername }, (response) => {
      if (!complete()) {
        return;
      }

      if (!response.ok) {
        setActionError(response.error.message);
        return;
      }

      clearCompletedRace();
      setUsername(normalizedUsername);
      rememberUsername(normalizedUsername);
      setPlayerId(response.data.playerId);
      setRoom(response.data.room);
      setActionError(null);
    });
  };

  const joinRoom = () => {
    if (!requireConnectedSocket()) {
      return;
    }

    const normalizedUsername = validateUsername();
    const normalizedRoomCode = roomCodeInput.trim().toUpperCase();

    if (!normalizedUsername) {
      return;
    }

    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(normalizedRoomCode)) {
      setActionError("Invalid room code. Enter the six-character room code.");
      return;
    }

    const complete = beginAcknowledgedAction("join");

    if (!complete) {
      return;
    }

    socket.emit(
      "room:join",
      { username: normalizedUsername, roomCode: normalizedRoomCode },
      (response) => {
        if (!complete()) {
          return;
        }

        if (!response.ok) {
          setActionError(response.error.message);
          return;
        }

        clearCompletedRace();
        setUsername(normalizedUsername);
        rememberUsername(normalizedUsername);
        setRoomCodeInput(normalizedRoomCode);
        setPlayerId(response.data.playerId);
        setRoom(response.data.room);
        setActionError(null);
      },
    );
  };

  const startRace = () => {
    if (!room || !requireConnectedSocket()) {
      return;
    }

    setChallengeNotice(null);
    const complete = beginAcknowledgedAction("start");

    if (!complete) {
      return;
    }

    socket.emit(
      "race:start",
      { roomCode: room.code, generateChallenge: requestAiChallenge },
      (response) => {
        if (!complete()) {
          return;
        }

        if (!response.ok) {
          setActionError(response.error.message);
        }
      },
    );
  };

  const submitAnswer = () => {
    if (!room || !race || !requireConnectedSocket()) {
      return;
    }

    const normalizedExplanation = explanation.trim();
    const normalizedProposedFix = proposedFix.trim();

    if (
      normalizedExplanation.length < 10 ||
      explanation.length > 2_000 ||
      normalizedProposedFix.length === 0 ||
      proposedFix.length > 4_000
    ) {
      setSubmissionError(
        "Enter an explanation of at least 10 characters and a proposed fix.",
      );
      return;
    }

    const complete = beginAcknowledgedAction("submit");

    if (!complete) {
      return;
    }

    socket.emit(
      "race:submit",
      {
        roomCode: room.code,
        explanation: normalizedExplanation,
        proposedFix: normalizedProposedFix,
      },
      (response) => {
        if (!complete()) {
          return;
        }

        if (!response.ok) {
          if (response.error.code === "RACE_ENDED") {
            setServerDeadlineRejected(true);
            setSubmissionError("The server deadline has passed.");
            return;
          }

          setSubmissionError(response.error.message);
          return;
        }

        setExplanation(normalizedExplanation);
        setProposedFix(normalizedProposedFix);
        setAcceptedSubmissionId(response.data.submissionId);
        setSubmissionError(null);
      },
    );
  };

  const testConnection = () => {
    if (!socket.connected) {
      setPingState({ status: "error", message: "Socket is disconnected." });
      return;
    }

    setPingState({ status: "pending" });
    let settled = false;

    pingTimeout.current = setTimeout(() => {
      settled = true;
      pingTimeout.current = null;
      setPingState({
        status: "error",
        message: "Acknowledgement timed out after 5 seconds.",
      });
    }, acknowledgementTimeoutMs);

    socket.emit(
      "connection:ping",
      { sentAt: new Date().toISOString() },
      (response) => {
        if (settled) {
          return;
        }

        settled = true;

        if (pingTimeout.current) {
          clearTimeout(pingTimeout.current);
          pingTimeout.current = null;
        }

        setPingState({ status: "success", response });
      },
    );
  };

  const copyRoomCode = async () => {
    if (!room || !navigator.clipboard) {
      setActionError("Clipboard access is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(room.code);
      setCopyFeedback("Copied");
    } catch {
      setActionError("The room code could not be copied.");
    }
  };

  const startNewRace = () => {
    resettingForNewRace.current = true;
    setActionError(null);
    setConnectionError(null);
    setPingState({ status: "idle" });
    setRoomCodeInput("");
    setRequestAiChallenge(false);

    if (socket.connected) {
      socket.disconnect();
    } else {
      setPlayerId(null);
      setRoom(null);
      clearCompletedRace();
    }

    setConnectionState("Connecting");
    socket.connect();
  };

  const screen = getGameScreen(room);
  const isHost = room !== null && room.hostPlayerId === playerId;
  const currentPlayer = room?.players.find((player) => player.id === playerId);
  const hasSubmitted = currentPlayer?.status === "SUBMITTED";
  const isEvaluating =
    currentPlayer?.status === "EVALUATING" ||
    (acceptedSubmissionId !== null && ownEvaluation === null);
  const hasTimedOut = currentPlayer?.status === "TIME_EXPIRED";
  const deadlinePassed =
    race !== null && serverClock > 0 && serverClock >= race.endsAt;
  const deadlineReached = deadlinePassed || serverDeadlineRejected;
  const submissionFieldsValid =
    explanation.trim().length >= 10 &&
    explanation.length <= 2_000 &&
    proposedFix.trim().length >= 1 &&
    proposedFix.length <= 4_000;
  const canSubmit =
    connectionState === "Connected" &&
    room?.status === "ACTIVE" &&
    serverClock > 0 &&
    !deadlineReached &&
    pendingAction === null &&
    !hasSubmitted &&
    !isEvaluating &&
    !hasTimedOut &&
    ownEvaluation === null &&
    submissionFieldsValid;
  const submissionLocked =
    Boolean(hasSubmitted) ||
    isEvaluating ||
    Boolean(hasTimedOut) ||
    ownEvaluation !== null ||
    deadlineReached;
  const submissionState = hasTimedOut
    ? "TIME_EXPIRED"
    : isEvaluating
      ? "EVALUATING"
      : hasSubmitted || ownEvaluation
        ? "SUBMITTED"
        : "IDLE";
  const timerLabel =
    race === null || serverClock === 0
      ? "Synchronizing server time…"
      : room?.status === "COUNTDOWN"
        ? `Starts in ${Math.max(0, Math.ceil((race.startsAt - serverClock) / 1_000))}s`
        : room?.status === "ACTIVE"
          ? deadlineReached
            ? "Time expired"
            : `${Math.max(0, Math.ceil((race.endsAt - serverClock) / 1_000))}s remaining`
          : room?.status === "FINALIZING"
            ? "Finalizing evaluations…"
            : "Race finished";
  const bugRaceProgress =
    race === null || serverClock === 0
      ? 0
      : room?.status === "COUNTDOWN"
        ? Math.min(
            100,
            Math.max(0, (1 - (race.startsAt - serverClock) / 3_000) * 100),
          )
        : room?.status === "ACTIVE"
          ? Math.min(
              100,
              Math.max(
                0,
                ((serverClock - race.startsAt) /
                  (race.endsAt - race.startsAt)) *
                  100,
              ),
            )
          : 100;

  return (
    <main className="bugrace-shell min-h-screen px-4 py-5 text-slate-100 sm:px-6 sm:py-7">
      <span aria-hidden="true" className="floating-bug floating-bug-one">
        🪲
      </span>
      <span aria-hidden="true" className="floating-bug floating-bug-two">
        🐛
      </span>

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-full border-2 border-slate-200 bg-rose-400 text-2xl"
            >
              🐞
            </span>
            <div>
              <p className="text-xl font-semibold tracking-tight">BugRace AI</p>
              {room ? (
                <p className="font-mono text-xs tracking-[0.16em] text-slate-500">
                  ROOM {room.code}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Debug at race speed</p>
              )}
            </div>
          </div>
          <ConnectionStatus
            connectionError={connectionError}
            connectionState={connectionState}
            onTestConnection={testConnection}
            pingState={pingState}
            socketId={socketId}
          />
        </header>

        {screen === "HOME" ? (
          <HomeScreen
            actionError={actionError}
            createPending={pendingAction === "create"}
            disabled={connectionState !== "Connected" || pendingAction !== null}
            joinPending={pendingAction === "join"}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            onRoomCodeChange={setRoomCodeInput}
            onUsernameChange={setUsername}
            roomCode={roomCodeInput}
            username={username}
          />
        ) : null}

        {screen === "LOBBY" && room ? (
          <LobbyScreen
            actionError={actionError}
            challengeNotice={challengeNotice}
            connected={connectionState === "Connected"}
            copyFeedback={copyFeedback}
            isHost={isHost}
            onCopyRoomCode={copyRoomCode}
            onRequestAiChallengeChange={setRequestAiChallenge}
            onStartRace={startRace}
            pendingStart={pendingAction === "start"}
            playerId={playerId}
            requestAiChallenge={requestAiChallenge}
            room={room}
          />
        ) : null}

        {screen === "RACE" ? (
          room && race ? (
            <RaceScreen
              canSubmit={canSubmit}
              deadlineReached={deadlineReached}
              explanation={explanation}
              onExplanationChange={setExplanation}
              onProposedFixChange={setProposedFix}
              onSubmitAnswer={submitAnswer}
              ownEvaluation={ownEvaluation}
              pendingSubmit={pendingAction === "submit"}
              playerId={playerId}
              progress={bugRaceProgress}
              proposedFix={proposedFix}
              race={race}
              room={room}
              submissionError={submissionError}
              submissionLocked={submissionLocked}
              submissionState={submissionState}
              timerLabel={timerLabel}
            />
          ) : (
            <section className="game-panel p-8 text-center">
              <h1 className="text-2xl font-semibold">
                Synchronizing challenge…
              </h1>
              <p className="mt-2 text-slate-500">
                Waiting for the server to send the race payload.
              </p>
            </section>
          )
        ) : null}

        {screen === "RESULTS" ? (
          <ResultsScreen
            finalResult={finalResult}
            onNewRace={startNewRace}
            playerId={playerId}
            race={race}
          />
        ) : null}
      </div>
    </main>
  );
}
