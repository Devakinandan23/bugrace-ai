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
    let successFeedback =
      "You identified the unresolved asynchronous results and provided a valid way to resolve or return them.";

    if (input.challenge.title === "The Missing Checkout Result") {
      const mentionsMissingReturn =
        explanation.includes("missing return") ||
        explanation.includes("does not return") ||
        explanation.includes("doesn't return") ||
        explanation.includes("never returns");
      const mentionsCalculatedResult =
        explanation.includes("finalprice") ||
        explanation.includes("final_price") ||
        explanation.includes("calculated") ||
        explanation.includes("discount");
      const returnsCalculatedResult =
        proposedFix.includes("return finalprice") ||
        proposedFix.includes("return final_price") ||
        (proposedFix.includes("return") &&
          proposedFix.includes("price") &&
          proposedFix.includes("discount"));

      rootCauseScore =
        mentionsMissingReturn && mentionsCalculatedResult
          ? 35
          : mentionsMissingReturn
            ? 20
            : explanation.includes("return")
              ? 10
              : 0;
      fixScore = returnsCalculatedResult ? 35 : 0;
      detectedConcepts = [
        ...(mentionsMissingReturn ? ["missing return"] : []),
        ...(mentionsCalculatedResult ? ["calculated result"] : []),
        ...(returnsCalculatedResult ? ["return value"] : []),
      ];
      missingConcepts = [
        ...(!mentionsMissingReturn ? ["missing return"] : []),
        ...(!mentionsCalculatedResult ? ["calculated result"] : []),
        ...(!returnsCalculatedResult ? ["return value"] : []),
      ];
      successFeedback =
        "You identified the missing return and returned the calculated checkout value.";
    } else if (input.challenge.title === "The Backwards Shipping Rule") {
      const mentionsReversedComparison =
        explanation.includes("reversed") ||
        explanation.includes("wrong comparison") ||
        explanation.includes("less than") ||
        explanation.includes("<=");
      const mentionsMinimumThreshold =
        explanation.includes("50 or more") ||
        explanation.includes("at least 50") ||
        explanation.includes("minimum") ||
        explanation.includes("greater than");
      const fixesComparison =
        proposedFix.includes(">= 50") ||
        proposedFix.includes(">=50") ||
        proposedFix.includes("total >= 50") ||
        proposedFix.includes("total>=50");

      rootCauseScore =
        mentionsReversedComparison && mentionsMinimumThreshold
          ? 35
          : mentionsReversedComparison
            ? 20
            : explanation.includes("condition")
              ? 10
              : 0;
      fixScore = fixesComparison ? 35 : 0;
      detectedConcepts = [
        ...(mentionsReversedComparison ? ["reversed comparison"] : []),
        ...(mentionsMinimumThreshold ? ["minimum threshold"] : []),
        ...(fixesComparison ? ["correct comparison"] : []),
      ];
      missingConcepts = [
        ...(!mentionsReversedComparison ? ["reversed comparison"] : []),
        ...(!mentionsMinimumThreshold ? ["minimum threshold"] : []),
        ...(!fixesComparison ? ["correct comparison"] : []),
      ];
      successFeedback =
        "You identified the reversed shipping condition and corrected the minimum threshold comparison.";
    } else if (input.challenge.title === "The Missing Final Score") {
      const mentionsLoopBoundary =
        explanation.includes("off by one") ||
        explanation.includes("stops early") ||
        explanation.includes("loop boundary") ||
        explanation.includes("length - 1") ||
        explanation.includes("size() - 1");
      const mentionsLastItem =
        explanation.includes("last score") ||
        explanation.includes("last item") ||
        explanation.includes("final score") ||
        explanation.includes("final element");
      const includesEveryItem =
        proposedFix.includes("index < scores.length") ||
        proposedFix.includes("index < scores.size()") ||
        proposedFix.includes("index<scores.size()") ||
        proposedFix.includes("range(len(scores))") ||
        proposedFix.includes("sum(scores)");

      rootCauseScore =
        mentionsLoopBoundary && mentionsLastItem
          ? 35
          : mentionsLoopBoundary
            ? 20
            : explanation.includes("loop")
              ? 10
              : 0;
      fixScore = includesEveryItem ? 35 : 0;
      detectedConcepts = [
        ...(mentionsLoopBoundary ? ["loop boundary"] : []),
        ...(mentionsLastItem ? ["last item"] : []),
        ...(includesEveryItem ? ["complete iteration"] : []),
      ];
      missingConcepts = [
        ...(!mentionsLoopBoundary ? ["loop boundary"] : []),
        ...(!mentionsLastItem ? ["last item"] : []),
        ...(!includesEveryItem ? ["complete iteration"] : []),
      ];
      successFeedback =
        "You identified the early loop boundary and included the final score.";
    } else if (input.challenge.title === "The Forgotten Bonus") {
      const mentionsWrongReturn =
        explanation.includes("returns points") ||
        explanation.includes("wrong return") ||
        explanation.includes("does not return total") ||
        explanation.includes("doesn't return total");
      const mentionsCalculatedTotal =
        explanation.includes("calculated total") ||
        explanation.includes("total variable") ||
        explanation.includes("bonus");
      const returnsTotal =
        proposedFix.includes("return total") ||
        (proposedFix.includes("return") &&
          proposedFix.includes("points") &&
          proposedFix.includes("bonus"));

      rootCauseScore =
        mentionsWrongReturn && mentionsCalculatedTotal
          ? 35
          : mentionsWrongReturn
            ? 20
            : explanation.includes("return")
              ? 10
              : 0;
      fixScore = returnsTotal ? 35 : 0;
      detectedConcepts = [
        ...(mentionsWrongReturn ? ["wrong return value"] : []),
        ...(mentionsCalculatedTotal ? ["calculated total"] : []),
        ...(returnsTotal ? ["correct return value"] : []),
      ];
      missingConcepts = [
        ...(!mentionsWrongReturn ? ["wrong return value"] : []),
        ...(!mentionsCalculatedTotal ? ["calculated total"] : []),
        ...(!returnsTotal ? ["correct return value"] : []),
      ];
      successFeedback =
        "You identified that the wrong value was returned and returned the score including the bonus.";
    } else if (input.challenge.title === "The Stock That Never Changes") {
      const mentionsDiscardedResult =
        explanation.includes("discarded") ||
        explanation.includes("not assigned") ||
        explanation.includes("does not update") ||
        explanation.includes("doesn't update") ||
        explanation.includes("no assignment");
      const mentionsUnchangedValue =
        explanation.includes("unchanged") ||
        explanation.includes("original stock") ||
        explanation.includes("same value");
      const storesSubtraction =
        proposedFix.includes("remaining -= sold") ||
        proposedFix.includes("remaining-=sold") ||
        proposedFix.includes("remaining = remaining - sold") ||
        proposedFix.includes("remaining=remaining-sold") ||
        proposedFix.includes("return stock - sold") ||
        proposedFix.includes("return stock-sold");

      rootCauseScore =
        mentionsDiscardedResult && mentionsUnchangedValue
          ? 35
          : mentionsDiscardedResult
            ? 20
            : explanation.includes("subtract")
              ? 10
              : 0;
      fixScore = storesSubtraction ? 35 : 0;
      detectedConcepts = [
        ...(mentionsDiscardedResult ? ["discarded result"] : []),
        ...(mentionsUnchangedValue ? ["unchanged value"] : []),
        ...(storesSubtraction ? ["value assignment"] : []),
      ];
      missingConcepts = [
        ...(!mentionsDiscardedResult ? ["discarded result"] : []),
        ...(!mentionsUnchangedValue ? ["unchanged value"] : []),
        ...(!storesSubtraction ? ["value assignment"] : []),
      ];
      successFeedback =
        "You identified the discarded subtraction and stored or returned the updated stock.";
    } else if (input.challenge.title === "The Double-Booked Seats") {
      const mentionsRaceCondition =
        explanation.includes("race condition") ||
        explanation.includes("concurrent") ||
        explanation.includes("at the same time");
      const mentionsStaleState =
        explanation.includes("stale") ||
        explanation.includes("same remaining") ||
        explanation.includes("overwrite") ||
        explanation.includes("shared state");
      const makesUpdateAtomic = [
        "atomic",
        "lock",
        "mutex",
        "synchronized",
        "transaction",
        "compare-and-swap",
        "version",
        "serializ",
      ].some((term) => proposedFix.includes(term));

      rootCauseScore =
        mentionsRaceCondition && mentionsStaleState
          ? 35
          : mentionsRaceCondition
            ? 20
            : explanation.includes("order")
              ? 10
              : 0;
      fixScore = makesUpdateAtomic ? 35 : 0;
      detectedConcepts = [
        ...(mentionsRaceCondition ? ["race condition"] : []),
        ...(mentionsStaleState ? ["stale shared state"] : []),
        ...(makesUpdateAtomic ? ["atomic update"] : []),
      ];
      missingConcepts = [
        ...(!mentionsRaceCondition ? ["race condition"] : []),
        ...(!mentionsStaleState ? ["stale shared state"] : []),
        ...(!makesUpdateAtomic ? ["atomic update"] : []),
      ];
      successFeedback =
        "You identified the stale shared-state race and proposed an atomic or serialized update.";
    } else if (input.challenge.language === "CPP") {
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
          ? successFeedback
          : `Address the missing concept${missingConcepts.length === 1 ? "" : "s"}: ${missingConcepts.join(", ")}.`,
      detectedConcepts,
      missingConcepts,
      source: "MOCK",
    };
  }
}

export const mockSubmissionEvaluator = new MockSubmissionEvaluator();
