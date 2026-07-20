import type { PublicPlayer } from "@bugrace/shared";

interface PlayerListProps {
  playerId: string | null;
  players: PublicPlayer[];
  compact?: boolean;
}

export function PlayerList({
  playerId,
  players,
  compact = false,
}: PlayerListProps) {
  return (
    <ul className={`space-y-2 ${compact ? "text-sm" : ""}`}>
      {players.map((player) => (
        <li
          key={player.id}
          className="game-tile flex items-center justify-between gap-4 px-4 py-3"
        >
          <span className="flex min-w-0 items-center">
            <span aria-hidden="true" className="player-bug shrink-0">
              {player.isHost ? "🐞" : "🪲"}
            </span>
            <span className="truncate">
              {player.username}
              {player.id === playerId ? " · You" : ""}
            </span>
          </span>
          <span className="shrink-0 text-right text-xs text-slate-500">
            <span className="block">{player.isHost ? "Host" : "Player"}</span>
            <strong className="mt-1 block tracking-wide text-amber-300">
              {player.status}
            </strong>
          </span>
        </li>
      ))}
    </ul>
  );
}
