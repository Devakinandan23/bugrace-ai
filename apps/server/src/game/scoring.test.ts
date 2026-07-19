import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFinalScore,
  calculateSpeedScore,
  deriveCorrectness,
  SCORING_RULES,
} from "./scoring.js";

test("the scoring contract totals 100 points", () => {
  assert.deepEqual(SCORING_RULES, {
    rootCauseMaximum: 35,
    fixMaximum: 35,
    reasoningMaximum: 20,
    speedMaximum: 10,
    incorrectAnswerCap: 40,
    penaltyPerHint: 5,
    maximumScore: 100,
    correctRootCauseThreshold: 35,
    correctFixThreshold: 35,
  });
});

test("correctness is derived only from perfect root-cause and fix scores", () => {
  assert.equal(deriveCorrectness({ rootCauseScore: 35, fixScore: 35 }), true);
  assert.equal(deriveCorrectness({ rootCauseScore: 20, fixScore: 35 }), false);
  assert.equal(deriveCorrectness({ rootCauseScore: 35, fixScore: 20 }), false);
});

test("speed decays from ten to zero using server acceptance time", () => {
  const timing = { startsAt: 1_000, endsAt: 11_000 };

  assert.equal(calculateSpeedScore({ ...timing, acceptedAt: 1_000 }), 10);
  assert.equal(calculateSpeedScore({ ...timing, acceptedAt: 6_000 }), 5);
  assert.equal(calculateSpeedScore({ ...timing, acceptedAt: 11_000 }), 0);
});

test("a perfect immediate answer earns 100 points", () => {
  const score = calculateFinalScore({
    correct: true,
    rootCauseScore: 35,
    fixScore: 35,
    reasoningScore: 20,
    acceptedAt: 1_000,
    startsAt: 1_000,
    endsAt: 11_000,
    hintsUsed: 0,
  });

  assert.equal(score.semanticSubtotal, 90);
  assert.equal(score.speedScore, 10);
  assert.equal(score.hintsUsed, 0);
  assert.equal(score.hintPenalty, 0);
  assert.equal(score.finalScore, 100);
});

test("incorrect answers get no speed points and are capped at 40", () => {
  const score = calculateFinalScore({
    correct: false,
    rootCauseScore: 35,
    fixScore: 20,
    reasoningScore: 20,
    acceptedAt: 1_000,
    startsAt: 1_000,
    endsAt: 11_000,
    hintsUsed: 3,
  });

  assert.equal(score.semanticSubtotal, 75);
  assert.equal(score.speedScore, 0);
  assert.equal(score.hintsUsed, 0);
  assert.equal(score.hintPenalty, 0);
  assert.equal(score.incorrectAnswerCapApplied, true);
  assert.equal(score.finalScore, 40);
});
