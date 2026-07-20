import type { FinalRaceResult, RaceStartedPayload } from "@bugrace/shared";

import { RaceResults } from "@/app/race-results";

interface ResultsScreenProps {
  finalResult: FinalRaceResult | null;
  onNewRace: () => void;
  playerId: string | null;
  race: RaceStartedPayload | null;
}

export function ResultsScreen({
  finalResult,
  onNewRace,
  playerId,
  race,
}: ResultsScreenProps) {
  if (!race || !finalResult) {
    return (
      <section className="game-panel p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-300">
          Results unavailable
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          The final leaderboard has not arrived.
        </h1>
        <p className="mt-3 text-slate-500">
          Keep this page open while the server completes the race.
        </p>
      </section>
    );
  }

  return (
    <section className="game-panel p-6 sm:p-8">
      <RaceResults
        challenge={race.challenge}
        playerId={playerId}
        result={finalResult}
      />
      <div className="mt-8 border-t border-slate-800 pt-7 text-center">
        <button
          type="button"
          onClick={onNewRace}
          className="game-primary px-6 py-3"
        >
          New race
        </button>
        <p className="mt-3 text-sm text-slate-500">
          Return home without reloading. Your username stays ready.
        </p>
      </div>
    </section>
  );
}
