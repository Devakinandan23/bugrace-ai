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

const settings = {
  language: "TYPESCRIPT",
  difficulty: "MEDIUM",
  durationSeconds: 120,
} as const;

function validOutput() {
  return {
    category: "ASYNC_COLLECTION" as const,
    title: "Overlapping Balance Updates",
    scenario:
      "Two requests adjust one account balance at nearly the same time, but one completed adjustment disappears.",
    language: "TYPESCRIPT" as const,
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

function validPythonOutput() {
  return {
    ...validOutput(),
    title: "Delayed Profile Loading",
    scenario:
      "A profile endpoint returns items that cannot be serialized even though every lookup function is asynchronous.",
    language: "PYTHON" as const,
    buggyCode: `async def load_profiles(ids):
    profiles = [fetch_profile(profile_id) for profile_id in ids]
    return profiles`,
    rootCause:
      "Calling fetch_profile without awaiting it creates coroutine objects, so the returned list does not contain resolved profiles.",
    referenceFix:
      "Use await asyncio.gather over the fetch_profile calls and return the resulting profile values.",
    requiredConcepts: ["coroutine objects", "asyncio gather"],
    acceptedAlternatives: [
      "Await each fetch_profile call in a loop when sequential loading is acceptable.",
    ],
    invalidFixes: ["Await the list after the comprehension has completed."],
  };
}

function validEasyOutput() {
  return {
    category: "MISSING_RETURN" as const,
    title: "Missing Checkout Result",
    scenario:
      "A checkout helper calculates the discounted total, but its caller receives no value to display.",
    language: "TYPESCRIPT" as const,
    difficulty: "EASY" as const,
    buggyCode: `function discountedPrice(price: number, percent: number) {
  const discount = price * (percent / 100);
  const finalPrice = price - discount;
}`,
    rootCause:
      "The function calculates finalPrice but never returns it, so callers receive undefined instead of the discounted total.",
    referenceFix: "Return finalPrice after calculating the discount.",
    requiredConcepts: ["missing return", "calculated result"],
    acceptedAlternatives: [
      "Return price minus the calculated discount directly.",
    ],
    invalidFixes: ["Print finalPrice without returning it."],
  };
}

function fakeOpenAI(
  parse: (body?: unknown, options?: unknown) => Promise<unknown>,
): OpenAI {
  return { responses: { parse } } as unknown as OpenAI;
}

test("valid generated challenge is accepted with an application-owned ID", () => {
  const challenge = validateGeneratedChallenge(validOutput(), settings);

  assert.match(challenge.public.id, /^ai-/);
  assert.equal(challenge.public.source, "AI_GENERATED");
  assert.equal(challenge.public.title, validOutput().title);
  assert.equal(challenge.private.rootCause, validOutput().rootCause);
});

test("valid Python generated challenge is accepted", () => {
  const pythonSettings = { ...settings, language: "PYTHON" } as const;
  const challenge = validateGeneratedChallenge(
    validPythonOutput(),
    pythonSettings,
  );

  assert.equal(challenge.public.language, "PYTHON");
  assert.equal(challenge.public.source, "AI_GENERATED");
});

test("generated medium challenge with more than 18 non-empty lines is rejected", () => {
  const output = {
    ...validOutput(),
    buggyCode: Array.from(
      { length: 19 },
      (_, index) => `const value${index} = ${index};`,
    ).join("\n"),
  };

  assert.throws(
    () => validateGeneratedChallenge(output, settings),
    ChallengeGenerationError,
  );
});

test("generated easy challenge accepts familiar beginner constructs", () => {
  const easySettings = { ...settings, difficulty: "EASY" } as const;
  const challenge = validateGeneratedChallenge(validEasyOutput(), easySettings);

  assert.equal(challenge.public.difficulty, "EASY");
  assert.equal(challenge.public.title, "Missing Checkout Result");
});

test("generated easy challenge rejects asynchronous concepts", () => {
  const easySettings = { ...settings, difficulty: "EASY" } as const;
  const output = {
    ...validEasyOutput(),
    buggyCode: `async function discountedPrice(price: number) {
  return await loadDiscount(price);
}`,
    rootCause:
      "The asynchronous function waits for a discount in a challenge intended to use only beginner constructs.",
  };

  assert.throws(
    () => validateGeneratedChallenge(output, easySettings),
    ChallengeGenerationError,
  );
});

test("generated challenge without a root cause is rejected", () => {
  const withoutRootCause = { ...validOutput(), rootCause: undefined };

  assert.throws(
    () => validateGeneratedChallenge(withoutRootCause, settings),
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
    () => validateGeneratedChallenge(output, settings),
    ChallengeGenerationError,
  );
});

test("recent duplicate challenge is rejected", () => {
  const output = validOutput();
  const recent = new Set([challengeFingerprint(output)]);

  assert.throws(
    () => validateGeneratedChallenge(output, settings, recent),
    ChallengeGenerationError,
  );
});

test("duplicate required concepts are rejected after normalization", () => {
  const output = {
    ...validOutput(),
    requiredConcepts: ["Atomic database update", "atomic-database update"],
  };

  assert.throws(
    () => validateGeneratedChallenge(output, settings),
    ChallengeGenerationError,
  );
});

test("public fields that reveal a required concept are rejected", () => {
  const output = {
    ...validOutput(),
    title: "Atomic Database Update Failure",
  };

  assert.throws(
    () => validateGeneratedChallenge(output, settings),
    ChallengeGenerationError,
  );
});

test("mixed public/private model shape is rejected", () => {
  const output = {
    ...validOutput(),
    private: { rootCause: "must stay server-only" },
  };

  assert.throws(
    () => validateGeneratedChallenge(output, settings),
    ChallengeGenerationError,
  );
});

test("generated challenge must match the requested language", () => {
  assert.throws(
    () =>
      validateGeneratedChallenge(
        { ...validOutput(), language: "JAVA" },
        settings,
      ),
    ChallengeGenerationError,
  );
});

test("generated challenge must match the requested difficulty", () => {
  assert.throws(
    () =>
      validateGeneratedChallenge(
        { ...validOutput(), difficulty: "HARD" },
        settings,
      ),
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

  const challenge = await generator.generate(settings);
  const body = request as {
    store?: boolean;
    tools?: unknown;
    input?: Array<{ role?: string; content?: string }>;
    text?: { format?: unknown };
  };

  assert.equal(calls, 1);
  assert.equal(challenge.public.source, "AI_GENERATED");
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.deepEqual(
    body.input?.map((item) => item.role),
    ["system", "user"],
  );
  assert.match(body.input?.[0]?.content ?? "", /EASY: 5-10 non-empty lines/);
  assert.deepEqual(JSON.parse(body.input?.[1]?.content ?? "{}"), {
    language: "TYPESCRIPT",
    difficulty: "MEDIUM",
    category: "ASYNC_COLLECTION",
  });
  assert.ok(body.text?.format);
  assert.deepEqual(requestOptions, { timeout: 15_000, maxRetries: 0 });
});

test("generator rejects the same recent model output on a later call", async () => {
  let calls = 0;
  const generator = new OpenAIChallengeGenerator(
    fakeOpenAI(async () => {
      const output = {
        ...validOutput(),
        category:
          calls === 0
            ? ("ASYNC_COLLECTION" as const)
            : ("ERROR_HANDLING" as const),
      };
      calls += 1;

      return {
        status: "completed",
        output: [],
        output_parsed: output,
      };
    }),
    "test-model",
    15_000,
  );

  await generator.generate(settings);
  await assert.rejects(
    () => generator.generate(settings),
    ChallengeGenerationError,
  );
});

test("generation failure selects the curated fallback", async () => {
  const generator: ChallengeGenerator = {
    async generate() {
      throw new Error("offline");
    },
  };

  const result = await generateChallengeOrFallback(generator, {
    language: "JAVA",
    difficulty: "HARD",
    durationSeconds: 120,
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.challenge.public.source, "CURATED");
  assert.equal(result.challenge.public.language, "JAVA");
  assert.equal(result.challenge.public.difficulty, "HARD");
});

test("mismatched generated settings select the requested curated fallback", async () => {
  const generator: ChallengeGenerator = {
    async generate() {
      return validateGeneratedChallenge(validOutput(), settings);
    },
  };
  const result = await generateChallengeOrFallback(generator, {
    language: "JAVA",
    difficulty: "HARD",
    durationSeconds: 120,
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.challenge.public.language, "JAVA");
  assert.equal(result.challenge.public.difficulty, "HARD");
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

  validateGeneratedChallenge(output, settings);

  assert.equal((globalThis as Record<string, unknown>)[marker], undefined);
});
