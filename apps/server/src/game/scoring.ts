interface ComponentScores {
  rootCauseScore: number;
  fixScore: number;
  reasoningScore: number;
}

export function clampScore(score: number, maximum: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(maximum, Math.max(0, score));
}

export function calculateFinalScore(input: ComponentScores): number {
  return input.rootCauseScore + input.fixScore + input.reasoningScore;
}
