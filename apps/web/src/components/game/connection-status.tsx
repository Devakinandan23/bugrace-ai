import type { ConnectionPingAcknowledgement } from "@bugrace/shared";

export type ConnectionState =
  "Connecting" | "Connected" | "Disconnected" | "Connection error";

export type PingState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; response: ConnectionPingAcknowledgement }
  | { status: "error"; message: string };

interface ConnectionStatusProps {
  connectionError: string | null;
  connectionState: ConnectionState;
  onTestConnection: () => void;
  pingState: PingState;
  socketId: string | null;
}

export function ConnectionStatus({
  connectionError,
  connectionState,
  onTestConnection,
  pingState,
  socketId,
}: ConnectionStatusProps) {
  const statusClassName =
    connectionState === "Connected"
      ? "bg-emerald-400"
      : connectionState === "Connecting"
        ? "bg-amber-400"
        : "bg-rose-400";

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
      <span className="inline-flex items-center gap-2 font-medium">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${statusClassName} ${
            connectionState === "Connected" ? "status-pulse" : ""
          }`}
        />
        {connectionState}
      </span>
      <code className="max-w-44 truncate text-xs text-slate-500">
        {socketId ?? "No socket ID"}
      </code>
      <button
        type="button"
        onClick={onTestConnection}
        disabled={
          connectionState !== "Connected" || pingState.status === "pending"
        }
        className="game-secondary min-h-0! px-3 py-1.5 text-xs"
      >
        {pingState.status === "pending" ? "Testing…" : "Test connection"}
      </button>
      <span aria-live="polite" className="basis-full text-right text-xs">
        {connectionError ? (
          <span className="text-rose-300">{connectionError}</span>
        ) : pingState.status === "success" ? (
          <span className="text-emerald-300">Backend acknowledged</span>
        ) : pingState.status === "error" ? (
          <span className="text-rose-300">{pingState.message}</span>
        ) : null}
      </span>
    </div>
  );
}
