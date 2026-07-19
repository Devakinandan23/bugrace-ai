import type { ScoreBreakdown } from "@bugrace/shared";

export const SCORING_RULES = {
  rootCauseMaximum: 35,
  fixMaximum: 35,
  reasoningMaximum: 20,
  speedMaximum: 10,
  incorrectAnswerCap: 40,
  penaltyPerHint: 5,
  maximumScore: 100,
  correctRootCauseThreshold: 35,
  correctFixThreshold: 35,
} as const;

export const PUBLIC_SCORING_RULES = {
  maximumScore: SCORING_RULES.maximumScore,
  speedMaximum: SCORING_RULES.speedMaximum,
  incorrectAnswerCap: SCORING_RULES.incorrectAnswerCap,
  penaltyPerHint: SCORING_RULES.penaltyPerHint,
} as const;

export function deriveCorrectness(input: {
  rootCauseScore: number;
  fixScore: number;
}): boolean {
  return (
    input.rootCauseScore === SCORING_RULES.correctRootCauseThreshold &&
    input.fixScore === SCORING_RULES.correctFixThreshold
  );
}

export function calculateSpeedScore(input: {
  acceptedAt: number;
  startsAt: number;
  endsAt: number;
}): number {
  const durationMs = input.endsAt - input.startsAt;

  if (durationMs <= 0) {
    return 0;
  }

  const elapsedMs = Math.min(
    durationMs,
    Math.max(0, input.acceptedAt - input.startsAt),
  );
  const remainingRatio = Math.max(0, durationMs - elapsedMs) / durationMs;

  return Math.round(remainingRatio * SCORING_RULES.speedMaximum);
}

export function calculateFinalScore(input: {
  correct: boolean;
  rootCauseScore: number;
  fixScore: number;
  reasoningScore: number;
  acceptedAt: number;
  startsAt: number;
  endsAt: number;
  hintsUsed: number;
}): ScoreBreakdown {
  const semanticSubtotal =
    input.rootCauseScore + input.fixScore + input.reasoningScore;

  if (!input.correct) {
    return {
      rootCauseScore: input.rootCauseScore,
      fixScore: input.fixScore,
      reasoningScore: input.reasoningScore,
      semanticSubtotal,
      speedScore: 0,
      hintsUsed: 0,
      hintPenalty: 0,
      incorrectAnswerCapApplied:
        semanticSubtotal > SCORING_RULES.incorrectAnswerCap,
      finalScore: Math.min(semanticSubtotal, SCORING_RULES.incorrectAnswerCap),
      maximumScore: SCORING_RULES.maximumScore,
    };
  }

  const speedScore = calculateSpeedScore({
    acceptedAt: input.acceptedAt,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });
  const normalizedHints = Math.max(0, Math.floor(input.hintsUsed));
  const hintPenalty = normalizedHints * SCORING_RULES.penaltyPerHint;
  const finalScore = Math.max(
    0,
    Math.min(
      SCORING_RULES.maximumScore,
      semanticSubtotal + speedScore - hintPenalty,
    ),
  );

  return {
    rootCauseScore: input.rootCauseScore,
    fixScore: input.fixScore,
    reasoningScore: input.reasoningScore,
    semanticSubtotal,
    speedScore,
    hintsUsed: normalizedHints,
    hintPenalty,
    incorrectAnswerCapApplied: false,
    finalScore,
    maximumScore: SCORING_RULES.maximumScore,
  };
}

export function createZeroScore(): ScoreBreakdown {
  return {
    rootCauseScore: 0,
    fixScore: 0,
    reasoningScore: 0,
    semanticSubtotal: 0,
    speedScore: 0,
    hintsUsed: 0,
    hintPenalty: 0,
    incorrectAnswerCapApplied: false,
    finalScore: 0,
    maximumScore: SCORING_RULES.maximumScore,
  };
}
