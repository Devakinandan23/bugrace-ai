import {
  EvaluationError,
  type EvaluationInput,
  type SemanticEvaluation,
  type SubmissionEvaluator,
} from "./evaluator.js";

export class FallbackSubmissionEvaluator implements SubmissionEvaluator {
  constructor(
    private readonly primary: SubmissionEvaluator,
    private readonly fallback: SubmissionEvaluator | null,
  ) {}

  async evaluate(input: EvaluationInput): Promise<SemanticEvaluation> {
    try {
      return await this.primary.evaluate(input);
    } catch (error) {
      if (!this.fallback) {
        throw error instanceof EvaluationError
          ? error
          : new EvaluationError(
              "EVALUATION_UNAVAILABLE",
              "The evaluator is unavailable.",
              { cause: error },
            );
      }

      const result = await this.fallback.evaluate(input);
      return { ...result, source: "MOCK_FALLBACK" };
    }
  }
}
