import type { ChallengeLanguage } from "@bugrace/shared";

import type { ChallengePrivateData } from "./challenge-data.js";

export function createPrivateEvaluationData(
  language: ChallengeLanguage,
): ChallengePrivateData {
  if (language === "JAVASCRIPT" || language === "TYPESCRIPT") {
    return {
      rootCause:
        "Array.map with an async callback returns an array of unresolved promises rather than resolved users.",
      referenceFix:
        "Return Promise.all(ids.map((id) => fetchUser(id))) so the collection resolves before it is returned.",
      requiredConcepts: ["async callback", "array of promises", "Promise.all"],
      acceptedAlternatives: [
        "Await Promise.all over the promises returned by map.",
        "Use a for-of loop and await each fetch when sequential loading is acceptable.",
      ],
      invalidFixes: [
        "Add await directly before ids.map without resolving the returned promises.",
      ],
    };
  }

  if (language === "CPP") {
    return {
      rootCause:
        "The function collects std::future<User> values but declares and returns std::vector<User> without resolving those futures.",
      referenceFix:
        "Collect the futures, call get() on each future, and return a std::vector<User> containing the resolved users.",
      requiredConcepts: [
        "std::future",
        "future resolution",
        "result collection",
      ],
      acceptedAlternatives: [
        "Return std::vector<std::future<User>> if the API is intentionally asynchronous.",
      ],
      invalidFixes: ["Cast the vector of futures to a vector of users."],
    };
  }

  if (language === "JAVA") {
    return {
      rootCause:
        "The method collects CompletableFuture<User> values but declares and returns List<User> without resolving those futures.",
      referenceFix:
        "Wait for the CompletableFuture values and collect their joined User results before returning List<User>.",
      requiredConcepts: [
        "CompletableFuture",
        "future resolution",
        "result collection",
      ],
      acceptedAlternatives: [
        "Return CompletableFuture<List<User>> and compose all futures before completing it.",
      ],
      invalidFixes: ["Cast List<CompletableFuture<User>> to List<User>."],
    };
  }

  return {
    rootCause:
      "Calling an async function without awaiting it creates coroutine objects, so the list contains unresolved coroutines instead of users.",
    referenceFix:
      "Await asyncio.gather over the fetch_user calls and return the resolved users.",
    requiredConcepts: [
      "coroutine",
      "result collection",
      "coroutine resolution",
    ],
    acceptedAlternatives: [
      "Use a loop and await each fetch_user call when sequential loading is acceptable.",
    ],
    invalidFixes: ["Await the list itself after the comprehension completes."],
  };
}

export const privateEvaluationData = createPrivateEvaluationData("TYPESCRIPT");
