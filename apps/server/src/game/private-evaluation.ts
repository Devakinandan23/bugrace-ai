export const privateEvaluationData = {
  rootCause: "Array.map with an async callback returns an array of promises.",
  referenceFix: "Return Promise.all(ids.map((id) => fetchUser(id))).",
  requiredConcepts: ["async callback", "array of promises", "Promise.all"],
} as const;
