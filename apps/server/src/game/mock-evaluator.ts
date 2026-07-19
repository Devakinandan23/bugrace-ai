import type {
  EvaluationInput,
  FixScore,
  ReasoningScore,
  RootCauseScore,
  SemanticEvaluation,
  SubmissionEvaluator,
} from "./evaluator.js";

export class MockSubmissionEvaluator implements SubmissionEvaluator {
  // This evaluator is intentionally limited, deterministic, and never executes code.
  async evaluate(input: EvaluationInput): Promise<SemanticEvaluation> {
    const explanation = input.submission.explanation.toLowerCase();
    const proposedFix = input.submission.proposedFix.toLowerCase();
    const mentionsArrayOfPromises =
      explanation.includes("array of promises") ||
      explanation.includes("array of promise") ||
      explanation.includes("promise[]") ||
      explanation.includes("promise array") ||
      explanation.includes("promises array");
    const mentionsPromises = explanation.includes("promise");
    const mentionsAsync =
      explanation.includes("async") || explanation.includes("await");
    const mentionsPromiseAll = proposedFix.includes("promise.all");

    const rootCauseScore: RootCauseScore = mentionsArrayOfPromises
      ? 35
      : mentionsPromises
        ? 20
        : mentionsAsync
          ? 10
          : 0;
    const fixScore: FixScore = mentionsPromiseAll ? 35 : 0;
    const reasoningScore: ReasoningScore =
      rootCauseScore === 35 && fixScore === 35
        ? 20
        : rootCauseScore === 35
          ? 15
          : rootCauseScore === 20
            ? 10
            : rootCauseScore === 10
              ? 5
              : 0;
    const detectedConcepts = [
      ...(mentionsAsync ? ["async callback"] : []),
      ...(mentionsArrayOfPromises ? ["array of promises"] : []),
      ...(mentionsPromiseAll ? ["Promise.all"] : []),
    ];
    const missingConcepts = [
      ...(!mentionsArrayOfPromises ? ["array of promises"] : []),
      ...(!mentionsPromiseAll ? ["Promise.all"] : []),
    ];

    return {
      confidence: 1,
      rootCauseScore,
      fixScore,
      reasoningScore,
      feedback:
        missingConcepts.length === 0
          ? "You connected the async map behavior to an array of promises and resolved it with Promise.all."
          : `Address the missing concept${missingConcepts.length === 1 ? "" : "s"}: ${missingConcepts.join(", ")}.`,
      detectedConcepts,
      missingConcepts,
      source: "MOCK",
    };
  }
}

export const mockSubmissionEvaluator = new MockSubmissionEvaluator();
