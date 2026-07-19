export const privateEvaluationData = {
  rootCause: "Array.map with an async callback returns an array of promises.",
  referenceFix: "Return Promise.all(ids.map((id) => fetchUser(id))).",
  requiredConcepts: ["async callback", "array of promises", "Promise.all"],
  acceptedAlternatives: [
    "Await Promise.all over the promises returned by map.",
    "Use a for-of loop and await each fetch when sequential loading is acceptable.",
  ],
  invalidFixes: [
    "Add await directly before ids.map without resolving the returned promises.",
  ],
} as const;
