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
    let rootCauseScore: RootCauseScore = 0;
    let fixScore: FixScore = 0;
    let detectedConcepts: string[] = [];
    let missingConcepts: string[] = [];

    if (input.challenge.language === "CPP") {
      const mentionsFuture = explanation.includes("future");
      const mentionsFutureCollection =
        mentionsFuture &&
        (explanation.includes("vector") ||
          explanation.includes("collection") ||
          explanation.includes("list"));
      const mentionsAsync =
        explanation.includes("std::async") || explanation.includes("async");
      const resolvesFuture =
        proposedFix.includes(".get(") ||
        proposedFix.includes(".get()") ||
        proposedFix.includes("vector<std::future") ||
        proposedFix.includes("std::vector<std::future");

      rootCauseScore = mentionsFutureCollection
        ? 35
        : mentionsFuture
          ? 20
          : mentionsAsync
            ? 10
            : 0;
      fixScore = resolvesFuture ? 35 : 0;
      detectedConcepts = [
        ...(mentionsFuture ? ["std::future"] : []),
        ...(mentionsFutureCollection ? ["result collection"] : []),
        ...(resolvesFuture ? ["future resolution"] : []),
      ];
      missingConcepts = [
        ...(!mentionsFuture ? ["std::future"] : []),
        ...(!mentionsFutureCollection ? ["result collection"] : []),
        ...(!resolvesFuture ? ["future resolution"] : []),
      ];
    } else if (input.challenge.language === "JAVA") {
      const mentionsCompletableFuture =
        explanation.includes("completablefuture") ||
        explanation.includes("future");
      const mentionsFutureCollection =
        mentionsCompletableFuture &&
        (explanation.includes("list") ||
          explanation.includes("collection") ||
          explanation.includes("stream"));
      const resolvesFuture =
        proposedFix.includes("completablefuture.allof") ||
        proposedFix.includes(".join(") ||
        proposedFix.includes(".join()") ||
        proposedFix.includes(".get(") ||
        proposedFix.includes(".get()") ||
        proposedFix.includes("completablefuture<list");

      rootCauseScore = mentionsFutureCollection
        ? 35
        : mentionsCompletableFuture
          ? 20
          : explanation.includes("async")
            ? 10
            : 0;
      fixScore = resolvesFuture ? 35 : 0;
      detectedConcepts = [
        ...(mentionsCompletableFuture ? ["CompletableFuture"] : []),
        ...(mentionsFutureCollection ? ["result collection"] : []),
        ...(resolvesFuture ? ["future resolution"] : []),
      ];
      missingConcepts = [
        ...(!mentionsCompletableFuture ? ["CompletableFuture"] : []),
        ...(!mentionsFutureCollection ? ["result collection"] : []),
        ...(!resolvesFuture ? ["future resolution"] : []),
      ];
    } else if (input.challenge.language === "PYTHON") {
      const mentionsCoroutine =
        explanation.includes("coroutine") || explanation.includes("awaitable");
      const mentionsCoroutineCollection =
        mentionsCoroutine &&
        (explanation.includes("list") ||
          explanation.includes("collection") ||
          explanation.includes("comprehension"));
      const resolvesCoroutines =
        proposedFix.includes("asyncio.gather") ||
        (proposedFix.includes("await ") && proposedFix.includes("fetch_user("));

      rootCauseScore = mentionsCoroutineCollection
        ? 35
        : mentionsCoroutine
          ? 20
          : explanation.includes("await")
            ? 10
            : 0;
      fixScore = resolvesCoroutines ? 35 : 0;
      detectedConcepts = [
        ...(mentionsCoroutine ? ["coroutine"] : []),
        ...(mentionsCoroutineCollection ? ["result collection"] : []),
        ...(resolvesCoroutines ? ["coroutine resolution"] : []),
      ];
      missingConcepts = [
        ...(!mentionsCoroutine ? ["coroutine"] : []),
        ...(!mentionsCoroutineCollection ? ["result collection"] : []),
        ...(!resolvesCoroutines ? ["coroutine resolution"] : []),
      ];
    } else {
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

      rootCauseScore = mentionsArrayOfPromises
        ? 35
        : mentionsPromises
          ? 20
          : mentionsAsync
            ? 10
            : 0;
      fixScore = mentionsPromiseAll ? 35 : 0;
      detectedConcepts = [
        ...(mentionsAsync ? ["async callback"] : []),
        ...(mentionsArrayOfPromises ? ["array of promises"] : []),
        ...(mentionsPromiseAll ? ["Promise.all"] : []),
      ];
      missingConcepts = [
        ...(!mentionsArrayOfPromises ? ["array of promises"] : []),
        ...(!mentionsPromiseAll ? ["Promise.all"] : []),
      ];
    }

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

    return {
      confidence: 1,
      rootCauseScore,
      fixScore,
      reasoningScore,
      feedback:
        missingConcepts.length === 0
          ? "You identified the unresolved asynchronous results and provided a valid way to resolve or return them."
          : `Address the missing concept${missingConcepts.length === 1 ? "" : "s"}: ${missingConcepts.join(", ")}.`,
      detectedConcepts,
      missingConcepts,
      source: "MOCK",
    };
  }
}

export const mockSubmissionEvaluator = new MockSubmissionEvaluator();
