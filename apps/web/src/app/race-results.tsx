import type {
  FinalRaceResult,
  LeaderboardEntry,
  PublicChallenge,
} from "@bugrace/shared";

interface RaceResultsProps {
  challenge: PublicChallenge;
  playerId: string | null;
  result: FinalRaceResult;
}

function formatElapsed(elapsedMs: number | null): string {
  if (elapsedMs === null) {
    return "—";
  }

  return `${(elapsedMs / 1_000).toFixed(1)}s`;
}

function sourceLabel(
  source: NonNullable<LeaderboardEntry["evaluation"]>["source"],
): string {
  if (source === "OPENAI") {
    return "OpenAI evaluation";
  }

  if (source === "MOCK_FALLBACK") {
    return "Fallback evaluator used";
  }

  return "Deterministic evaluator";
}

function ParticipantBreakdown({
  entry,
  incorrectAnswerCap,
}: {
  entry: LeaderboardEntry;
  incorrectAnswerCap: number;
}) {
  const score = entry.score;

  return (
    <article className="game-tile rounded-xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rank-chip">
            {entry.rank === 1 ? "🏆" : entry.rank === 2 ? "🥈" : "🏁"} Rank #
            {entry.rank}
          </p>
          <h4 className="mt-1 text-xl font-semibold">
            {entry.username}
            {entry.isHost ? " · Host" : ""}
          </h4>
        </div>
        <div className="text-right">
          <p
            className={`font-semibold ${
              entry.outcome === "TIME_EXPIRED"
                ? "text-amber-300"
                : entry.correct
                  ? "text-emerald-300"
                  : "text-rose-300"
            }`}
          >
            {entry.outcome === "TIME_EXPIRED"
              ? "Did not submit"
              : entry.correct
                ? "Correct"
                : "Incorrect"}
          </p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">
            {score.finalScore} / {score.maximumScore}
          </p>
        </div>
      </div>

      {entry.outcome === "TIME_EXPIRED" ? (
        <p className="mt-5 rounded-lg bg-slate-900 px-4 py-3 text-sm text-slate-400">
          No submission was accepted before the server deadline. No evaluator
          result is available.
        </p>
      ) : (
        <>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Root cause</dt>
              <dd className="mt-1 font-semibold">
                {score.rootCauseScore} / 35
              </dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Fix</dt>
              <dd className="mt-1 font-semibold">{score.fixScore} / 35</dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Reasoning</dt>
              <dd className="mt-1 font-semibold">
                {score.reasoningScore} / 20
              </dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Semantic subtotal</dt>
              <dd className="mt-1 font-semibold">
                {score.semanticSubtotal} / 90
              </dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Speed</dt>
              <dd className="mt-1 font-semibold">{score.speedScore} / 10</dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Accepted after</dt>
              <dd className="mt-1 font-semibold">
                {formatElapsed(entry.elapsedMs)}
              </dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Hints used</dt>
              <dd className="mt-1 font-semibold">{score.hintsUsed}</dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Hint penalty</dt>
              <dd className="mt-1 font-semibold">{score.hintPenalty}</dd>
            </div>
            <div className="game-tile rounded-lg bg-slate-900 p-3">
              <dt className="text-slate-500">Final score</dt>
              <dd className="mt-1 font-semibold text-cyan-300">
                {score.finalScore} / 100
              </dd>
            </div>
          </dl>

          {!entry.correct ? (
            <p className="mt-4 text-sm text-amber-300">
              Speed score: 0. Incorrect-answer cap: {incorrectAnswerCap}.
              {score.incorrectAnswerCapApplied ? " The cap was applied." : ""}
            </p>
          ) : null}

          {entry.evaluation ? (
            <div className="mt-5 border-t border-slate-800 pt-5 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <p>
                  <span className="text-slate-500">Evaluator:</span>{" "}
                  {sourceLabel(entry.evaluation.source)}
                </p>
                <p>
                  <span className="text-slate-500">Confidence:</span>{" "}
                  {Math.round(entry.evaluation.confidence * 100)}%
                </p>
              </div>
              <p className="mt-3 text-slate-300">{entry.evaluation.feedback}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-slate-500">Detected concepts</p>
                  <p className="mt-1 text-slate-300">
                    {entry.evaluation.detectedConcepts.join(", ") || "None"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Missing concepts</p>
                  <p className="mt-1 text-slate-300">
                    {entry.evaluation.missingConcepts.join(", ") || "None"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

export function RaceResults({ challenge, playerId, result }: RaceResultsProps) {
  const submittedCount = result.leaderboard.filter(
    (entry) => entry.outcome === "SUBMITTED",
  ).length;
  const correctCount = result.leaderboard.filter(
    (entry) => entry.correct === true,
  ).length;
  const timedOutCount = result.leaderboard.length - submittedCount;
  const ownEntry = result.leaderboard.find(
    (entry) => entry.playerId === playerId,
  );

  return (
    <section className="results-celebration mt-8 border-t border-slate-800 pt-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
        Race finished
      </p>
      <h3 className="mt-2 text-3xl font-bold">Final leaderboard</h3>
      <p className="mt-2 text-sm text-slate-400">
        {result.finishReason === "ALL_SUBMITTED"
          ? "All players submitted"
          : "The server deadline was reached"}
        {" · "}
        {new Date(result.finishedAt).toISOString()}
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="game-tile rounded-xl bg-slate-950 p-4">
          <dt className="text-sm text-slate-500">Participants</dt>
          <dd className="mt-1 text-2xl font-bold">
            {result.leaderboard.length}
          </dd>
        </div>
        <div className="game-tile rounded-xl bg-slate-950 p-4">
          <dt className="text-sm text-slate-500">Submitted</dt>
          <dd className="mt-1 text-2xl font-bold">{submittedCount}</dd>
        </div>
        <div className="game-tile rounded-xl bg-slate-950 p-4">
          <dt className="text-sm text-slate-500">Correct</dt>
          <dd className="mt-1 text-2xl font-bold">{correctCount}</dd>
        </div>
        <div className="game-tile rounded-xl bg-slate-950 p-4">
          <dt className="text-sm text-slate-500">Timed out</dt>
          <dd className="mt-1 text-2xl font-bold">{timedOutCount}</dd>
        </div>
        <div className="timer-card rounded-xl bg-slate-950 p-4">
          <dt className="text-sm text-slate-500">Your result</dt>
          <dd className="mt-1 text-lg font-bold text-cyan-300">
            {ownEntry
              ? `#${ownEntry.rank} · ${ownEntry.score.finalScore}/100`
              : "Unavailable"}
          </dd>
        </div>
      </dl>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-slate-700">
              <th className="px-3 py-3">Rank</th>
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Result</th>
              <th className="px-3 py-3">Semantic</th>
              <th className="px-3 py-3">Speed</th>
              <th className="px-3 py-3">Final</th>
            </tr>
          </thead>
          <tbody>
            {result.leaderboard.map((entry) => (
              <tr
                key={entry.playerId}
                className={`border-b border-slate-800 transition-colors hover:bg-cyan-950/30 ${
                  entry.playerId === playerId ? "bg-cyan-950/50" : ""
                }`}
              >
                <td className="px-3 py-4 font-semibold">#{entry.rank}</td>
                <td className="px-3 py-4">
                  {entry.username}
                  {entry.isHost ? " · Host" : ""}
                  {entry.playerId === playerId ? " · You" : ""}
                </td>
                <td className="px-3 py-4">
                  {entry.outcome === "TIME_EXPIRED"
                    ? "Did not submit"
                    : entry.correct
                      ? "Correct"
                      : "Incorrect"}
                </td>
                <td className="px-3 py-4">
                  {entry.score.semanticSubtotal} / 90
                </td>
                <td className="px-3 py-4">{entry.score.speedScore} / 10</td>
                <td className="px-3 py-4 font-semibold text-cyan-300">
                  {entry.score.finalScore} / 100
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-9">
        <h3 className="text-2xl font-bold">Participant breakdowns</h3>
        <p className="mt-2 text-sm text-slate-400">
          Scores and evaluator feedback are public after the race. Submission
          text remains private.
        </p>
        <div className="mt-5 space-y-4">
          {result.leaderboard.map((entry) => (
            <ParticipantBreakdown
              key={entry.playerId}
              entry={entry}
              incorrectAnswerCap={result.scoringRules.incorrectAnswerCap}
            />
          ))}
        </div>
      </div>

      <div className="game-tile mt-9 rounded-xl border border-slate-700 bg-slate-950 p-5">
        <h3 className="text-xl font-semibold">Reference solution</h3>
        <p className="mt-2 text-sm text-slate-400">
          Challenge: {challenge.title}
        </p>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-slate-500">Root cause</dt>
            <dd className="mt-1 text-slate-200">
              {result.referenceAnswer.rootCause}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Reference fix</dt>
            <dd className="mt-1 whitespace-pre-wrap font-mono text-slate-200">
              {result.referenceAnswer.referenceFix}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Required concepts</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {result.referenceAnswer.requiredConcepts.map((concept) => (
                <span
                  key={concept}
                  className="rounded-full border border-slate-700 px-3 py-1 text-slate-300"
                >
                  {concept}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
