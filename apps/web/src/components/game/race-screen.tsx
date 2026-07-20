import type {
  PublicRoomState,
  RaceStartedPayload,
  SubmissionEvaluation,
} from "@bugrace/shared";

import { PlayerList } from "./player-list";

interface RaceScreenProps {
  canSubmit: boolean;
  deadlineReached: boolean;
  explanation: string;
  onExplanationChange: (explanation: string) => void;
  onProposedFixChange: (proposedFix: string) => void;
  onSubmitAnswer: () => void;
  ownEvaluation: SubmissionEvaluation | null;
  pendingSubmit: boolean;
  playerId: string | null;
  progress: number;
  proposedFix: string;
  race: RaceStartedPayload;
  room: PublicRoomState;
  submissionError: string | null;
  submissionLocked: boolean;
  submissionState: "IDLE" | "EVALUATING" | "SUBMITTED" | "TIME_EXPIRED";
  timerLabel: string;
}

function Timer({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="timer-card p-4">
      <p className="text-sm text-slate-500">Race clock</p>
      <p className="mt-1 text-xl font-semibold text-amber-300">{label}</p>
      <div className="countdown-race" aria-hidden="true">
        <span className="countdown-racer" style={{ left: `${progress}%` }}>
          🐞
        </span>
        <span className="countdown-finish">🏁</span>
      </div>
    </div>
  );
}

function EvaluationSummary({
  evaluation,
  finalizing,
}: {
  evaluation: SubmissionEvaluation;
  finalizing: boolean;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-emerald-900 bg-emerald-950 p-5">
      <p className="font-semibold text-emerald-300">Submission evaluated</p>
      <p className="mt-2 text-lg font-semibold">
        {evaluation.correct ? "Correct" : "Incorrect"} ·{" "}
        {evaluation.score.finalScore}
        /100
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Root cause</dt>
          <dd>{evaluation.score.rootCauseScore} / 35</dd>
        </div>
        <div>
          <dt className="text-slate-500">Fix</dt>
          <dd>{evaluation.score.fixScore} / 35</dd>
        </div>
        <div>
          <dt className="text-slate-500">Reasoning</dt>
          <dd>{evaluation.score.reasoningScore} / 20</dd>
        </div>
        <div>
          <dt className="text-slate-500">Speed</dt>
          <dd>{evaluation.score.speedScore} / 10</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-slate-400">
        {evaluation.evaluation.feedback}
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Evaluator</dt>
          <dd>
            {evaluation.evaluation.source === "OPENAI"
              ? "OpenAI evaluation"
              : evaluation.evaluation.source === "MOCK_FALLBACK"
                ? "Fallback evaluator used"
                : "Deterministic evaluator"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd>{Math.round(evaluation.evaluation.confidence * 100)}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">Detected concepts</dt>
          <dd>{evaluation.evaluation.detectedConcepts.join(", ") || "None"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Missing concepts</dt>
          <dd>{evaluation.evaluation.missingConcepts.join(", ") || "None"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        {finalizing
          ? "Finalizing evaluations…"
          : "Waiting for the other racers."}
      </p>
    </div>
  );
}

export function RaceScreen({
  canSubmit,
  deadlineReached,
  explanation,
  onExplanationChange,
  onProposedFixChange,
  onSubmitAnswer,
  ownEvaluation,
  pendingSubmit,
  playerId,
  progress,
  proposedFix,
  race,
  room,
  submissionError,
  submissionLocked,
  submissionState,
  timerLabel,
}: RaceScreenProps) {
  const countdown = room.status === "COUNTDOWN";
  const finalizing = room.status === "FINALIZING";

  if (countdown) {
    return (
      <section className="game-panel p-6 text-center sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-400">
          Get ready
        </p>
        <h1 className="mt-3 text-4xl font-semibold">
          The bug race starts soon
        </h1>
        <div className="mx-auto mt-7 max-w-xl">
          <Timer label={timerLabel} progress={progress} />
        </div>
        <dl className="mx-auto mt-7 grid max-w-xl gap-3 text-left sm:grid-cols-2">
          <div className="game-tile p-4">
            <dt className="text-sm text-slate-500">Category</dt>
            <dd className="mt-1 font-semibold">
              {race.challenge.topic.replaceAll("_", " ")}
            </dd>
          </div>
          <div className="game-tile p-4">
            <dt className="text-sm text-slate-500">Difficulty</dt>
            <dd className="mt-1 font-semibold">{race.challenge.difficulty}</dd>
          </div>
        </dl>
        <div className="mx-auto mt-7 max-w-xl text-left">
          <PlayerList compact playerId={playerId} players={room.players} />
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
      <article className="game-panel p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
          {race.challenge.source === "AI_GENERATED"
            ? "AI-generated challenge"
            : "Curated challenge"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{race.challenge.title}</h1>
        <p className="mt-3 leading-7 text-slate-400">
          {race.challenge.scenario}
        </p>
        <dl className="mt-5 flex flex-wrap gap-2 text-xs">
          <div className="rounded-full bg-cyan-950 px-3 py-1.5">
            {race.challenge.language}
          </div>
          <div className="rounded-full bg-emerald-950 px-3 py-1.5">
            {race.challenge.topic.replaceAll("_", " ")}
          </div>
          <div className="rounded-full bg-amber-950 px-3 py-1.5">
            {race.challenge.difficulty}
          </div>
        </dl>
        <div className="mt-6">
          <p className="mb-2 text-sm text-slate-500">Buggy code</p>
          <pre className="code-arena overflow-x-auto p-5 text-sm leading-6">
            <code>{race.challenge.buggyCode}</code>
          </pre>
        </div>
      </article>

      <aside className="space-y-6">
        <div className="game-panel p-5">
          <Timer label={timerLabel} progress={progress} />
          <div className="mt-5">
            <h2 className="font-semibold">Racers</h2>
            <div className="mt-3">
              <PlayerList compact playerId={playerId} players={room.players} />
            </div>
          </div>
        </div>

        <div className="game-panel p-5">
          <h2 className="text-xl font-semibold">
            {finalizing ? "Finalizing race" : "Submit your answer"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {finalizing
              ? "The server is completing accepted evaluations."
              : "Explain the root cause and propose a fix. Code is never executed."}
          </p>

          {!finalizing && submissionState === "IDLE" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitAnswer();
              }}
              className="mt-5 space-y-5"
            >
              <div>
                <div className="flex justify-between gap-4 text-sm">
                  <label htmlFor="explanation">Explanation</label>
                  <span className="text-xs text-slate-500">
                    {explanation.length} / 2,000
                  </span>
                </div>
                <textarea
                  id="explanation"
                  value={explanation}
                  onChange={(event) => onExplanationChange(event.target.value)}
                  required
                  minLength={10}
                  maxLength={2_000}
                  rows={5}
                  disabled={submissionLocked}
                  placeholder="Explain the root cause…"
                  className="game-field mt-2 w-full resize-y px-4 py-3 outline-none"
                />
              </div>
              <div>
                <div className="flex justify-between gap-4 text-sm">
                  <label htmlFor="proposed-fix">Proposed fix</label>
                  <span className="text-xs text-slate-500">
                    {proposedFix.length} / 4,000
                  </span>
                </div>
                <textarea
                  id="proposed-fix"
                  value={proposedFix}
                  onChange={(event) => onProposedFixChange(event.target.value)}
                  required
                  maxLength={4_000}
                  rows={6}
                  disabled={submissionLocked}
                  placeholder="Show the corrected TypeScript…"
                  className="game-field mt-2 w-full resize-y px-4 py-3 font-mono text-sm outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="game-primary submit-button w-full px-5 py-3"
              >
                <span aria-hidden="true" className="submit-ladybug">
                  🐞
                </span>
                <span>{pendingSubmit ? "Submitting…" : "Submit answer"}</span>
                <span aria-hidden="true" className="submit-arrow">
                  →
                </span>
              </button>
            </form>
          ) : (
            <div className="game-tile mt-5 p-4 text-sm">
              <p className="font-semibold">
                {submissionState === "TIME_EXPIRED"
                  ? "Time expired"
                  : submissionState === "EVALUATING"
                    ? "Submission accepted"
                    : ownEvaluation
                      ? "Evaluation complete"
                      : "Answer submitted"}
              </p>
              <p className="mt-1 text-slate-500">
                {submissionState === "TIME_EXPIRED"
                  ? "Waiting for final results."
                  : submissionState === "EVALUATING"
                    ? "Your private answer is being evaluated."
                    : "Waiting for the final leaderboard."}
              </p>
            </div>
          )}

          {deadlineReached && submissionState === "IDLE" ? (
            <p className="mt-4 text-sm font-medium text-amber-300">
              The server deadline has passed. Waiting for final results.
            </p>
          ) : null}
          {submissionError ? (
            <p
              role="alert"
              className="mt-4 rounded-2xl border border-rose-900 bg-rose-950 px-4 py-3 text-sm text-rose-300"
            >
              {submissionError}
            </p>
          ) : null}
          {ownEvaluation ? (
            <EvaluationSummary
              evaluation={ownEvaluation}
              finalizing={finalizing}
            />
          ) : null}
        </div>
      </aside>
    </section>
  );
}
