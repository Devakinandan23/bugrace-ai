import assert from "node:assert/strict";
import test from "node:test";

import { getCuratedChallenge } from "./challenge-data.js";

const baseSettings = {
  language: "TYPESCRIPT",
  durationSeconds: 120,
} as const;

test("easy curated challenge uses familiar synchronous constructs", () => {
  const challenge = getCuratedChallenge({
    ...baseSettings,
    difficulty: "EASY",
  });

  assert.equal(challenge.public.title, "The Missing Checkout Result");
  assert.doesNotMatch(
    challenge.public.buggyCode,
    /\b(?:async|await|promise|future|coroutine)\b/i,
  );
  assert.match(challenge.private.rootCause, /never returns/i);
  assert.match(challenge.private.referenceFix, /return the calculated/i);
  assert.equal("category" in challenge.public, false);
});

test("easy curated challenges rotate through five different bug types", () => {
  const challenges = Array.from({ length: 5 }, () =>
    getCuratedChallenge({
      ...baseSettings,
      difficulty: "EASY",
    }),
  );

  assert.equal(
    new Set(challenges.map((challenge) => challenge.public.title)).size,
    5,
  );
  for (const challenge of challenges) {
    assert.equal(challenge.public.difficulty, "EASY");
    assert.doesNotMatch(
      challenge.public.buggyCode,
      /\b(?:async|await|promise|future|coroutine)\b/i,
    );
    assert.ok(challenge.private.referenceFix.length > 0);
  }
});

test("medium curated challenge keeps the asynchronous collection defect", () => {
  const challenge = getCuratedChallenge({
    ...baseSettings,
    difficulty: "MEDIUM",
  });

  assert.equal(challenge.public.title, "The Unresolved User Collection");
  assert.match(challenge.public.buggyCode, /ids\.map\(async/);
  assert.match(challenge.private.referenceFix, /Promise\.all/);
});

test("hard curated challenge uses a shared-state concurrency defect", () => {
  const challenge = getCuratedChallenge({
    ...baseSettings,
    difficulty: "HARD",
  });

  assert.equal(challenge.public.title, "The Double-Booked Seats");
  assert.match(challenge.public.buggyCode, /remainingSeats/);
  assert.deepEqual(challenge.private.requiredConcepts, [
    "race condition",
    "stale shared state",
    "atomic update",
  ]);
});
