export interface SubmissionEvaluator {
  evaluate(input: { explanation: string; proposedFix: string }): {
    correct: boolean;
    rootCauseScore: number;
    fixScore: number;
    reasoningScore: number;
    feedback: string;
  };
}

// This deterministic evaluator is intentionally temporary and does not execute code.
export const mockSubmissionEvaluator: SubmissionEvaluator = {
  evaluate(input) {
    const combined = `${input.explanation} ${input.proposedFix}`.toLowerCase();
    const mentionsPromiseAll = combined.includes("promise.all");
    const mentionsPromises =
      combined.includes("array of promises") ||
      combined.includes("promise[]") ||
      combined.includes("array of promise");

    return {
      correct: mentionsPromiseAll && mentionsPromises,
      rootCauseScore: mentionsPromises ? 35 : 10,
      fixScore: mentionsPromiseAll ? 35 : 0,
      reasoningScore: mentionsPromiseAll && mentionsPromises ? 15 : 5,
      feedback: mentionsPromiseAll
        ? "You identified Promise.all as the required fix."
        : "The proposed fix does not resolve the array of promises.",
    };
  },
};
