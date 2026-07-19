import assert from "node:assert/strict";
import test from "node:test";

import type OpenAI from "openai";

import {
  challengeFingerprint,
  ChallengeGenerationError,
  generateChallengeOrFallback,
  OpenAIChallengeGenerator,
  validateGeneratedChallenge,
  type ChallengeGenerator,
} from "./challenge-generator.js";

function validOutput() {
  return {
    title: "Overlapping Balance Updates",
    scenario:
      "Two requests adjust one account balance at nearly the same time, but one completed adjustment disappears.",
    language: "typescript" as const,
    topic: "CONCURRENCY" as const,
    difficulty: "MEDIUM" as const,
    buggyCode: `async function adjustBalance(id: string, delta: number) {
  const account = await db.account.findUnique({ where: { id } });
  if (!account) throw new Error("Missing account");
  await db.account.update({
    where: { id },
    data: { balance: account.balance + delta },
  });
}`,
    rootCause:
      "The read-modify-write sequence is not atomic, so concurrent requests can overwrite an update based on stale data.",
    referenceFix:
      "Use an atomic database increment or perform the read and update inside a transaction with an appropriate row lock.",
    requiredConcepts: ["atomic database update", "concurrent write"],
    acceptedAlternatives: [
      "Use optimistic concurrency with a version check and retry conflicts.",
    ],
    invalidFixes: ["Await the update call a second time."],
  };
}

function fakeOpenAI(
  parse: (body?: unknown, options?: unknown) => Promise<unknown>,
): OpenAI {
  return { responses: { parse } } as unknown as OpenAI;
}

test("valid generated challenge is accepted with an application-owned ID", () => {
  const challenge = validateGeneratedChallenge(validOutput());

  assert.match(challenge.public.id, /^ai-/);
  assert.equal(challenge.public.source, "AI_GENERATED");
  assert.equal(challenge.public.title, validOutput().title);
  assert.equal(challenge.private.rootCause, validOutput().rootCause);
});

test("generated challenge with more than 25 non-empty lines is rejected", () => {
  const output = {
    ...validOutput(),
    buggyCode: Array.from(
      { length: 26 },
      (_, index) => `const value${index} = ${index};`,
    ).join("\n"),
  };

  assert.throws(
    () => validateGeneratedChallenge(output),
    ChallengeGenerationError,
  );
});

test("generated challenge without a root cause is rejected", () => {
  const withoutRootCause = { ...validOutput(), rootCause: undefined };

  assert.throws(
    () => validateGeneratedChallenge(withoutRootCause),
    ChallengeGenerationError,
  );
});

test("generated challenge containing dangerous code is rejected", () => {
  const output = {
    ...validOutput(),
    buggyCode:
      "function leakSecret() { return process.env.OPENAI_API_KEY ?? 'missing'; }",
  };

  assert.throws(
    () => validateGeneratedChallenge(output),
    ChallengeGenerationError,
  );
});

test("recent duplicate challenge is rejected", () => {
  const output = validOutput();
  const recent = new Set([challengeFingerprint(output)]);

  assert.throws(
    () => validateGeneratedChallenge(output, recent),
    ChallengeGenerationError,
  );
});

test("duplicate required concepts are rejected after normalization", () => {
  const output = {
    ...validOutput(),
    requiredConcepts: ["Atomic database update", "atomic-database update"],
  };

  assert.throws(
    () => validateGeneratedChallenge(output),
    ChallengeGenerationError,
  );
});

test("public fields that reveal a required concept are rejected", () => {
  const output = {
    ...validOutput(),
    title: "Atomic Database Update Failure",
  };

  assert.throws(
    () => validateGeneratedChallenge(output),
    ChallengeGenerationError,
  );
});

test("mixed public/private model shape is rejected", () => {
  const output = {
    ...validOutput(),
    private: { rootCause: "must stay server-only" },
  };

  assert.throws(
    () => validateGeneratedChallenge(output),
    ChallengeGenerationError,
  );
});

test("OpenAI generator uses one structured Responses call without tools or storage", async () => {
  let calls = 0;
  let request: unknown;
  let requestOptions: unknown;
  const generator = new OpenAIChallengeGenerator(
    fakeOpenAI(async (body, options) => {
      calls += 1;
      request = body;
      requestOptions = options;
      return {
        status: "completed",
        output: [],
        output_parsed: validOutput(),
      };
    }),
    "test-model",
    15_000,
  );

  const challenge = await generator.generate();
  const body = request as {
    store?: boolean;
    tools?: unknown;
    input?: Array<{ role?: string }>;
    text?: { format?: unknown };
  };

  assert.equal(calls, 1);
  assert.equal(challenge.public.source, "AI_GENERATED");
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.deepEqual(
    body.input?.map((item) => item.role),
    ["system"],
  );
  assert.ok(body.text?.format);
  assert.deepEqual(requestOptions, { timeout: 15_000, maxRetries: 0 });
});

test("generator rejects the same recent model output on a later call", async () => {
  const generator = new OpenAIChallengeGenerator(
    fakeOpenAI(async () => ({
      status: "completed",
      output: [],
      output_parsed: validOutput(),
    })),
    "test-model",
    15_000,
  );

  await generator.generate();
  await assert.rejects(() => generator.generate(), ChallengeGenerationError);
});

test("generation failure selects the curated fallback", async () => {
  const generator: ChallengeGenerator = {
    async generate() {
      throw new Error("offline");
    },
  };

  const result = await generateChallengeOrFallback(generator);

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.challenge.public.source, "CURATED");
});

test("generated code is validated as text and never executed", () => {
  const marker = "__bugraceGeneratedCodeExecuted";
  const output = {
    ...validOutput(),
    buggyCode: `function buggyHandler() {
  globalThis.${marker} = true;
  return "validation only";
}`,
  };

  validateGeneratedChallenge(output);

  assert.equal((globalThis as Record<string, unknown>)[marker], undefined);
});
