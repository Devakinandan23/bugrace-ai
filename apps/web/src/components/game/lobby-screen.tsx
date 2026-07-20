import type { PublicRoomState } from "@bugrace/shared";

import { PlayerList } from "./player-list";

interface LobbyScreenProps {
  actionError: string | null;
  challengeNotice: string | null;
  connected: boolean;
  copyFeedback: string | null;
  isHost: boolean;
  onCopyRoomCode: () => void;
  onRequestAiChallengeChange: (enabled: boolean) => void;
  onStartRace: () => void;
  pendingStart: boolean;
  playerId: string | null;
  requestAiChallenge: boolean;
  room: PublicRoomState;
}

export function LobbyScreen({
  actionError,
  challengeNotice,
  connected,
  copyFeedback,
  isHost,
  onCopyRoomCode,
  onRequestAiChallengeChange,
  onStartRace,
  pendingStart,
  playerId,
  requestAiChallenge,
  room,
}: LobbyScreenProps) {
  const preparing = room.status === "PREPARING";
  const hasEnoughPlayers = room.players.length >= 2;

  return (
    <section className="game-panel p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm text-slate-500">Room code</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.18em] text-cyan-300">
            {room.code}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCopyRoomCode}
            className="game-secondary min-h-0! px-4 py-2 text-sm"
          >
            Copy code
          </button>
          <span aria-live="polite" className="text-sm text-emerald-300">
            {copyFeedback}
          </span>
        </div>
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">Race lobby</h1>
            <span className="rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold tracking-wide text-amber-300">
              {preparing ? "PREPARING" : "WAITING"}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {room.players.length} player{room.players.length === 1 ? "" : "s"}
            connected · minimum 2 to start
          </p>
          <div className="mt-5">
            <PlayerList playerId={playerId} players={room.players} />
          </div>
        </div>

        <aside className="game-tile p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
            Challenge selection
          </p>
          <h2 className="mt-2 text-xl font-semibold">Async JavaScript</h2>
          <p className="mt-2 text-sm text-slate-500">
            {requestAiChallenge
              ? "AI-generated challenge with curated fallback"
              : "Curated challenge"}
          </p>

          {isHost ? (
            <>
              <label className="mt-6 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={requestAiChallenge}
                  onChange={(event) =>
                    onRequestAiChallengeChange(event.target.checked)
                  }
                  disabled={preparing || pendingStart}
                  className="mt-0.5 h-4 w-4 accent-cyan-400"
                />
                <span>
                  <span className="block font-medium">
                    Generate challenge with AI
                  </span>
                  <span className="mt-1 block text-slate-500">
                    Generation runs on the server. Failures use the curated
                    challenge.
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={onStartRace}
                disabled={
                  preparing || pendingStart || !connected || !hasEnoughPlayers
                }
                className="game-primary mt-6 w-full px-5 py-3"
              >
                {preparing
                  ? "Generating challenge…"
                  : pendingStart
                    ? "Starting race…"
                    : "Start race"}
              </button>
              {!hasEnoughPlayers ? (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Waiting for one more player.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-6 rounded-2xl bg-white px-4 py-3 text-center text-sm text-slate-500">
              🐛 Waiting for the host to start the race.
            </p>
          )}
        </aside>
      </div>

      {challengeNotice ? (
        <p className="mt-6 rounded-2xl border border-amber-900 bg-amber-950 px-4 py-3 text-sm text-amber-300">
          {challengeNotice}
        </p>
      ) : null}
      {actionError ? (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-rose-900 bg-rose-950 px-4 py-3 text-sm text-rose-300"
        >
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
