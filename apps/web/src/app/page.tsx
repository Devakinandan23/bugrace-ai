"use client";

import type { ConnectionPingAcknowledgement } from "@bugrace/shared";
import { useEffect, useRef, useState } from "react";

import { socket } from "@/lib/socket";

type ConnectionState =
  "Connecting" | "Connected" | "Disconnected" | "Connection error";

type PingState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; response: ConnectionPingAcknowledgement }
  | { status: "error"; message: string };

const acknowledgementTimeoutMs = 5_000;

export default function Home() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("Connecting");
  const [socketId, setSocketId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pingState, setPingState] = useState<PingState>({ status: "idle" });
  const pingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleConnect = () => {
      setConnectionState("Connected");
      setSocketId(socket.id ?? null);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      setConnectionState("Disconnected");
      setSocketId(null);
    };

    const handleConnectError = (error: Error) => {
      setConnectionState("Connection error");
      setConnectionError(error.message);
      setSocketId(null);
    };

    const handleConnectionReady = (payload: { socketId: string }) => {
      setSocketId(payload.socketId);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("connection:ready", handleConnectionReady);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("connection:ready", handleConnectionReady);
      socket.disconnect();

      if (pingTimeout.current) {
        clearTimeout(pingTimeout.current);
      }
    };
  }, []);

  const testConnection = () => {
    if (!socket.connected) {
      setPingState({ status: "error", message: "Socket is disconnected." });
      return;
    }

    setPingState({ status: "pending" });

    let acknowledged = false;
    pingTimeout.current = setTimeout(() => {
      if (!acknowledged) {
        setPingState({
          status: "error",
          message: "Acknowledgement timed out after 5 seconds.",
        });
      }
    }, acknowledgementTimeoutMs);

    socket.emit(
      "connection:ping",
      { sentAt: new Date().toISOString() },
      (response) => {
        acknowledged = true;

        if (pingTimeout.current) {
          clearTimeout(pingTimeout.current);
          pingTimeout.current = null;
        }

        setPingState({ status: "success", response });
      },
    );
  };

  const statusClassName =
    connectionState === "Connected"
      ? "bg-emerald-400"
      : connectionState === "Connecting"
        ? "bg-amber-400"
        : "bg-rose-400";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/30 sm:p-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-400">
          Connection check
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          BugRace AI
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          Real-time multiplayer debugging races
        </p>

        <div className="mt-10 space-y-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-400">Backend status</span>
            <span className="inline-flex items-center gap-2 font-medium">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${statusClassName}`}
              />
              {connectionState}
            </span>
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-slate-800 pt-5">
            <span className="text-sm text-slate-400">Socket ID</span>
            <code className="max-w-[70%] break-all text-right text-sm text-cyan-300">
              {socketId ?? "Not available"}
            </code>
          </div>

          {connectionError ? (
            <p role="alert" className="text-sm text-rose-300">
              {connectionError}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={testConnection}
          disabled={
            connectionState !== "Connected" || pingState.status === "pending"
          }
          className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {pingState.status === "pending"
            ? "Waiting for server…"
            : "Test connection"}
        </button>

        <div
          aria-live="polite"
          className="mt-4 min-h-12 rounded-xl bg-slate-950/70 px-4 py-3 text-sm text-slate-300"
        >
          {pingState.status === "idle" ? "No connection test sent yet." : null}
          {pingState.status === "pending"
            ? "Ping sent; awaiting acknowledgement."
            : null}
          {pingState.status === "success"
            ? `Acknowledged at ${pingState.response.receivedAt}`
            : null}
          {pingState.status === "error" ? (
            <span className="text-rose-300">{pingState.message}</span>
          ) : null}
        </div>
      </section>
    </main>
  );
}
