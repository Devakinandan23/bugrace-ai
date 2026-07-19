import assert from "node:assert/strict";
import test from "node:test";

import OpenAI from "openai";

import { aiEvaluationSchema } from "./evaluation-schema.js";
import type { EvaluationInput, SubmissionEvaluator } from "./evaluator.js";
import { FallbackSubmissionEvaluator } from "./fallback-evaluator.js";
import { MockSubmissionEvaluator } from "./mock-evaluator.js";
import { OpenAISubmissionEvaluator } from "./openai-evaluator.js";

const evaluationInput: EvaluationInput = {
  challenge: {
    title: "The Array of Promises",
    scenario: "Load users",
    language: "typescript",
    buggyCode: "ids.map(async (id) => fetchUser(id))",
  },
  rubric: {
    rootCause: "Async map returns an array of promises.",
    referenceFix: "Use Promise.all.",
    requiredConcepts: ["array of promises", "Promise.all"],
    acceptedAlternatives: ["Await all mapped promises."],
    invalidFixes: ["Await the array returned by map."],
  },
  submission: {
    explanation: "The async map returns an array of promises.",
    proposedFix: "return Promise.all(ids.map(fetchUser));",
  },
};

function fakeOpenAI(parse: (body?: unknown) => Promise<unknown>): OpenAI {
  return {
    responses: { parse },
  } as unknown as OpenAI;
}

test("OpenAI evaluator makes one Responses call with structured output and no storage", async () => {
  let calls = 0;
  let request: unknown;
  const evaluator = new OpenAISubmissionEvaluator(
    fakeOpenAI(async (body) => {
      calls += 1;
      request = body;
      return {
        status: "completed",
        output: [],
        output_parsed: {
          confidence: 0.9,
          rootCauseScore: 35,
          fixScore: 35,
          reasoningScore: 20,
          feedback: "Correct cause and fix.",
          detectedConcepts: ["array of promises", "Promise.all"],
          missingConcepts: [],
        },
      };
    }),
    "test-model",
  );

  const result = await evaluator.evaluate(evaluationInput);
  const body = request as {
    store?: boolean;
    tools?: unknown;
    input?: Array<{ role?: string }>;
    text?: { format?: unknown };
  };

  assert.equal(calls, 1);
  assert.equal(result.source, "OPENAI");
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.deepEqual(
    body.input?.map((item) => item.role),
    ["system", "user"],
  );
  assert.ok(body.text?.format);
});

function evaluatorWithFallback(parse: () => Promise<unknown>) {
  return new FallbackSubmissionEvaluator(
    new OpenAISubmissionEvaluator(fakeOpenAI(parse), "test-model"),
    new MockSubmissionEvaluator(),
  );
}

test("structured schema rejects unsupported scores and model-owned final score", () => {
  const valid = {
    confidence: 0.8,
    rootCauseScore: 35,
    fixScore: 35,
    reasoningScore: 20,
    feedback: "Good answer.",
    detectedConcepts: ["Promise.all"],
    missingConcepts: [],
  };

  assert.equal(aiEvaluationSchema.safeParse(valid).success, true);
  assert.equal(
    aiEvaluationSchema.safeParse({ ...valid, reasoningScore: 19 }).success,
    false,
  );
  assert.equal(
    aiEvaluationSchema.safeParse({ ...valid, finalScore: 100 }).success,
    false,
  );
});

test("missing parsed output triggers a labelled mock fallback", async () => {
  const evaluator = evaluatorWithFallback(async () => ({
    status: "completed",
    output: [],
    output_parsed: null,
  }));

  const result = await evaluator.evaluate(evaluationInput);
  assert.equal(result.source, "MOCK_FALLBACK");
  assert.equal(result.rootCauseScore, 35);
});

test("timeout triggers a labelled mock fallback", async () => {
  const evaluator = evaluatorWithFallback(async () => {
    const error = new Error("timeout");
    error.name = "APIConnectionTimeoutError";
    throw error;
  });

  const result = await evaluator.evaluate(evaluationInput);
  assert.equal(result.source, "MOCK_FALLBACK");
});

test("refusal triggers a labelled mock fallback", async () => {
  const evaluator = evaluatorWithFallback(async () => ({
    status: "completed",
    output_parsed: null,
    output: [
      {
        type: "message",
        content: [{ type: "refusal", refusal: "Cannot evaluate." }],
      },
    ],
  }));

  const result = await evaluator.evaluate(evaluationInput);
  assert.equal(result.source, "MOCK_FALLBACK");
});

test("fallback none preserves the infrastructure failure", async () => {
  const primary: SubmissionEvaluator = {
    async evaluate() {
      throw new Error("offline");
    },
  };
  const evaluator = new FallbackSubmissionEvaluator(primary, null);

  await assert.rejects(
    evaluator.evaluate(evaluationInput),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "The evaluator is unavailable.",
  );
});
