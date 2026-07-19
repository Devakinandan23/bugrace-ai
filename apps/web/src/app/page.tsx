"use client";

import type {
  ConnectionPingAcknowledgement,
  PublicRoomState,
  RaceStartedPayload,
} from "@bugrace/shared";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { socket } from "@/lib/socket";

type ConnectionState =
  "Connecting" | "Connected" | "Disconnected" | "Connection error";

type PingState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; response: ConnectionPingAcknowledgement }
  | { status: "error"; message: string };

type PendingAction = "create" | "join" | "start";

const acknowledgementTimeoutMs = 5_000;

function isValidUsername(username: string): boolean {
  const trimmedUsername = username.trim();
  return (
    trimmedUsername.length >= 2 &&
    trimmedUsername.length <= 20 &&
    !/\p{Cc}/u.test(trimmedUsername)
  );
}

export default function Home() {
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const pingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestId = useRef(0);
  const actionPending = useRef(false);

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

    const handleConnect = () => {
      setConnectionState("Connected");
      setSocketId(socket.id ?? null);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      cancelPendingAction();
      setConnectionState("Disconnected");
      setSocketId(null);
      setPlayerId(null);
      setRoom(null);
      setRace(null);
      setActionError("Socket disconnected. Reconnect before joining a room.");
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
      setActionError(null);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("connection:ready", handleConnectionReady);
    socket.on("room:state", handleRoomState);
    socket.on("race:started", handleRaceStarted);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("connection:ready", handleConnectionReady);
      socket.off("room:state", handleRoomState);
      socket.off("race:started", handleRaceStarted);
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

  const beginAcknowledgedAction = (
    action: PendingAction,
  ): (() => boolean) | null => {
    if (actionPending.current) {
      return null;
    }

    actionPending.current = true;
    setPendingAction(action);
    setActionError(null);

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
      setActionError("Server acknowledgement timed out.");
    }, acknowledgementTimeoutMs);

    return () => {
      if (activeRequestId.current !== requestId) {
        return false;
      }

      activeRequestId.current += 1;
      actionPending.current = false;
      setPendingAction(null);

      if (actionTimeout.current) {
        clearTimeout(actionTimeout.current);
        actionTimeout.current = null;
      }

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

  const createRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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

      setUsername(normalizedUsername);
      setPlayerId(response.data.playerId);
      setRoom(response.data.room);
    });
  };

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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

        setUsername(normalizedUsername);
        setRoomCodeInput(normalizedRoomCode);
        setPlayerId(response.data.playerId);
        setRoom(response.data.room);
      },
    );
  };

  const startRace = () => {
    if (!room || !requireConnectedSocket()) {
      return;
    }

    const complete = beginAcknowledgedAction("start");

    if (!complete) {
      return;
    }

    socket.emit("race:start", { roomCode: room.code }, (response) => {
      if (!complete()) {
        return;
      }

      if (!response.ok) {
        setActionError(response.error.message);
      }
    });
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

  const statusClassName =
    connectionState === "Connected"
      ? "bg-emerald-400"
      : connectionState === "Connecting"
        ? "bg-amber-400"
        : "bg-rose-400";

  const roomActionsDisabled =
    connectionState !== "Connected" || pendingAction !== null;
  const isHost = room !== null && room.hostPlayerId === playerId;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-4xl">
        <header>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-400">
            Multiplayer debugging
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            BugRace AI
          </h1>
          <p className="mt-3 text-lg text-slate-400">
            Real-time multiplayer debugging races
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Backend status</p>
              <p className="mt-1 inline-flex items-center gap-2 font-medium">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${statusClassName}`}
                />
                {connectionState}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Socket ID</p>
              <code className="mt-1 block break-all text-sm text-cyan-300">
                {socketId ?? "Not available"}
              </code>
            </div>
          </div>

          {connectionError ? (
            <p role="alert" className="mt-4 text-sm text-rose-300">
              {connectionError}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-5">
            <button
              type="button"
              onClick={testConnection}
              disabled={
                connectionState !== "Connected" ||
                pingState.status === "pending"
              }
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
            >
              {pingState.status === "pending"
                ? "Waiting for server…"
                : "Test connection"}
            </button>
            <p aria-live="polite" className="text-sm text-slate-400">
              {pingState.status === "idle"
                ? "No connection test sent yet."
                : null}
              {pingState.status === "pending"
                ? "Ping sent; awaiting acknowledgement."
                : null}
              {pingState.status === "success"
                ? `Acknowledged at ${pingState.response.receivedAt}`
                : null}
              {pingState.status === "error" ? pingState.message : null}
            </p>
          </div>
        </section>

        {actionError ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-200"
          >
            {actionError}
          </p>
        ) : null}

        {!room ? (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
            <h2 className="text-2xl font-semibold">Enter the lobby</h2>
            <p className="mt-2 text-slate-400">
              Choose a guest name, then create a room or join an existing one.
            </p>

            <label
              className="mt-6 block text-sm font-medium"
              htmlFor="username"
            >
              Guest username
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              placeholder="Ada"
              disabled={pendingAction !== null}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400 disabled:opacity-60"
            />

            <form onSubmit={createRoom} className="mt-5">
              <button
                type="submit"
                disabled={roomActionsDisabled}
                className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {pendingAction === "create" ? "Creating room…" : "Create room"}
              </button>
            </form>

            <div className="my-7 flex items-center gap-4 text-sm text-slate-500">
              <span className="h-px flex-1 bg-slate-800" />
              or join a room
              <span className="h-px flex-1 bg-slate-800" />
            </div>

            <form onSubmit={joinRoom}>
              <label className="block text-sm font-medium" htmlFor="room-code">
                Room code
              </label>
              <input
                id="room-code"
                value={roomCodeInput}
                onChange={(event) =>
                  setRoomCodeInput(event.target.value.toUpperCase())
                }
                maxLength={6}
                autoComplete="off"
                placeholder="ABC234"
                disabled={pendingAction !== null}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono uppercase tracking-[0.25em] outline-none focus:border-cyan-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={roomActionsDisabled}
                className="mt-4 w-full rounded-xl border border-cyan-500 px-5 py-3 font-semibold text-cyan-300 transition hover:bg-cyan-950 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {pendingAction === "join" ? "Joining room…" : "Join room"}
              </button>
            </form>
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-sm text-slate-400">Room code</p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-[0.18em] text-cyan-300">
                  {room.code}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={copyRoomCode}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:border-cyan-400"
                >
                  Copy room code
                </button>
                <span aria-live="polite" className="text-sm text-emerald-300">
                  {copyFeedback}
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-y border-slate-800 py-4">
              <span className="text-sm text-slate-400">Room status</span>
              <strong className="text-sm tracking-wide text-amber-300">
                {room.status}
              </strong>
            </div>

            <div className="mt-6">
              <h2 className="text-xl font-semibold">Players</h2>
              <ul className="mt-3 space-y-2">
                {room.players.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3"
                  >
                    <span>{player.username}</span>
                    <span className="text-sm text-slate-400">
                      {player.isHost ? "Host" : "Player"}
                      {player.id === playerId ? " · You" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {!race ? (
              <div className="mt-6">
                {isHost ? (
                  <button
                    type="button"
                    onClick={startRace}
                    disabled={
                      room.status !== "WAITING" ||
                      connectionState !== "Connected" ||
                      pendingAction !== null
                    }
                    className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {pendingAction === "start"
                      ? "Starting race…"
                      : "Start race"}
                  </button>
                ) : (
                  <p className="rounded-xl bg-slate-950 px-4 py-3 text-center text-slate-400">
                    Waiting for the host to start the race.
                  </p>
                )}
              </div>
            ) : (
              <article className="mt-8 border-t border-slate-800 pt-8">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Challenge {race.challenge.id}
                </p>
                <h2 className="mt-2 text-3xl font-bold">
                  {race.challenge.title}
                </h2>
                <p className="mt-3 text-slate-300">{race.challenge.scenario}</p>

                <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-950 p-4">
                    <dt className="text-slate-500">Language</dt>
                    <dd className="mt-1 font-medium">
                      {race.challenge.language}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-950 p-4">
                    <dt className="text-slate-500">Starts at</dt>
                    <dd className="mt-1 break-all font-mono text-xs">
                      <time dateTime={new Date(race.startsAt).toISOString()}>
                        {new Date(race.startsAt).toISOString()}
                      </time>
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-950 p-4">
                    <dt className="text-slate-500">Ends at</dt>
                    <dd className="mt-1 break-all font-mono text-xs">
                      <time dateTime={new Date(race.endsAt).toISOString()}>
                        {new Date(race.endsAt).toISOString()}
                      </time>
                    </dd>
                  </div>
                </dl>

                <div className="mt-6">
                  <p className="mb-2 text-sm text-slate-400">Buggy code</p>
                  <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm leading-6 text-slate-200">
                    <code>{race.challenge.buggyCode}</code>
                  </pre>
                </div>
              </article>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
