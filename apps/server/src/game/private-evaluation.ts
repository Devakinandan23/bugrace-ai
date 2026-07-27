import type { ChallengeDifficulty, ChallengeLanguage } from "@bugrace/shared";

import type { ChallengePrivateData } from "./challenge-data.js";

const easyEvaluationData = [
  {
    rootCause:
      "The function calculates the discounted price but never returns it, so the caller receives no result.",
    referenceFix: "Return the calculated final price before the function ends.",
    requiredConcepts: ["missing return", "calculated result"],
    acceptedAlternatives: [
      "Return the price minus the calculated discount directly.",
    ],
    invalidFixes: ["Print the final price without returning it to the caller."],
  },
  {
    rootCause:
      "The comparison is reversed: it grants free shipping below or at 50 instead of granting it for totals of 50 or more.",
    referenceFix:
      "Change the comparison so the function returns true when the total is greater than or equal to 50.",
    requiredConcepts: ["reversed comparison", "minimum threshold"],
    acceptedAlternatives: [
      "Return the result of checking whether total is at least 50.",
    ],
    invalidFixes: ["Change only the returned boolean values."],
  },
  {
    rootCause:
      "The loop stops one position too early, so it never adds the final score in the collection.",
    referenceFix:
      "Iterate through the full collection, including the element at the last valid index.",
    requiredConcepts: ["loop boundary", "last item"],
    acceptedAlternatives: [
      "Use the language's standard sum operation over all scores.",
    ],
    invalidFixes: [
      "Add one to the final total without reading the last score.",
    ],
  },
  {
    rootCause:
      "The function calculates the score including the bonus but returns the original points value instead of the calculated total.",
    referenceFix: "Return the calculated total rather than points.",
    requiredConcepts: ["wrong return value", "calculated total"],
    acceptedAlternatives: ["Return points plus bonus directly."],
    invalidFixes: ["Remove the bonus calculation."],
  },
  {
    rootCause:
      "The subtraction result is discarded because it is not assigned, so remaining keeps the original stock value.",
    referenceFix:
      "Assign remaining minus sold back to remaining, or return stock minus sold directly.",
    requiredConcepts: ["discarded result", "value assignment"],
    acceptedAlternatives: [
      "Use the language's subtraction-assignment operator.",
    ],
    invalidFixes: [
      "Evaluate the subtraction a second time without storing it.",
    ],
  },
] as const satisfies readonly ChallengePrivateData[];

export function createPrivateEvaluationData(
  language: ChallengeLanguage,
  difficulty: ChallengeDifficulty = "MEDIUM",
  variantIndex = 0,
): ChallengePrivateData {
  if (difficulty === "EASY") {
    return (
      easyEvaluationData[variantIndex % easyEvaluationData.length] ??
      easyEvaluationData[0]
    );
  }

  if (difficulty === "HARD") {
    return {
      rootCause:
        "Concurrent reservations can read the same remaining-seat value and later overwrite each other with stale calculated state.",
      referenceFix:
        "Make the availability check and seat decrement one atomic operation using a transaction, lock, mutex, synchronized section, or compare-and-swap appropriate to the language and storage.",
      requiredConcepts: [
        "race condition",
        "stale shared state",
        "atomic update",
      ],
      acceptedAlternatives: [
        "Serialize reservations so only one request checks and updates the remaining seats at a time.",
        "Use optimistic concurrency with a version check and retry conflicts.",
      ],
      invalidFixes: [
        "Await or call saveReservation a second time without protecting the shared state.",
      ],
    };
  }

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
