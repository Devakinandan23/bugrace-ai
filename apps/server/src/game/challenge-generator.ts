import { randomUUID } from "node:crypto";

import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { env } from "../config/env.js";
import {
  curatedChallenge,
  type GeneratedChallenge,
  type StoredChallenge,
} from "./challenge-data.js";

const GENERATION_INSTRUCTIONS = `Create one compact TypeScript debugging challenge for a multiplayer
developer game.

The challenge must contain exactly one primary technical defect.

It must be solvable by reading and reasoning about the code. It must
not require execution, external files, dependencies or internet access.

The buggy code must contain at most 25 non-empty lines.

Use one supported topic:
- asynchronous JavaScript;
- object-level authorization;
- database concurrency.

Provide:
- a short title;
- a realistic scenario;
- buggy TypeScript code;
- the exact root cause;
- a technically valid reference fix;
- required concepts;
- technically equivalent accepted solutions;
- plausible fixes that do not solve the bug.

Do not reveal the answer in the title, scenario, variable names or code
comments.

Do not create:
- multiple unrelated bugs;
- trick questions;
- obscure syntax trivia;
- destructive code;
- shell commands;
- filesystem deletion;
- credential access;
- environment-variable access;
- external URLs;
- package-installation instructions.`;

export const generatedChallengeSchema = z
  .object({
    title: z.string().trim().min(5).max(80),
    scenario: z.string().trim().min(20).max(300),
    language: z.literal("typescript"),
    topic: z.enum(["ASYNC_JAVASCRIPT", "AUTHORIZATION", "CONCURRENCY"]),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    buggyCode: z.string().trim().min(20).max(2_500),
    rootCause: z.string().trim().min(30).max(500),
    referenceFix: z.string().trim().min(10).max(1_500),
    requiredConcepts: z.array(z.string().trim().min(2).max(100)).min(2).max(6),
    acceptedAlternatives: z.array(z.string().trim().min(5).max(200)).max(5),
    invalidFixes: z.array(z.string().trim().min(5).max(200)).min(1).max(5),
  })
  .strict();

type GeneratedChallengeOutput = z.infer<typeof generatedChallengeSchema>;

export type ChallengeGenerationFailure =
  "REFUSED" | "INCOMPLETE" | "INVALID" | "UNAVAILABLE";

export class ChallengeGenerationError extends Error {
  constructor(
    readonly category: ChallengeGenerationFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ChallengeGenerationError";
  }
}

export interface ChallengeGenerator {
  generate(): Promise<GeneratedChallenge>;
}

const dangerousCodePatterns = [
  /child_process/i,
  /\bexec\s*\(/i,
  /\bspawn\s*\(/i,
  /process\s*\.\s*env/i,
  /\beval\s*\(/i,
  /new\s+Function\s*\(/i,
  /rm\s+-rf/i,
  /fs\s*\.\s*rm/i,
  /fs\s*\.\s*unlink/i,
  /\bcurl\b/i,
  /\bwget\b/i,
];

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function challengeFingerprint(input: {
  title: string;
  buggyCode: string;
}): string {
  return normalizedText(`${input.title}\n${input.buggyCode}`);
}

function codeComments(code: string): string {
  const comments = code.match(/\/\/.*$|\/\*[\s\S]*?\*\//gm);
  return comments?.join("\n") ?? "";
}

function publicFieldsRevealAnswer(input: GeneratedChallengeOutput): boolean {
  const disclosureSurface = normalizedText(
    `${input.title}\n${input.scenario}\n${codeComments(input.buggyCode)}`,
  );
  const identifiers =
    input.buggyCode
      .match(/\b[A-Za-z_$][\w$]*\b/g)
      ?.map((identifier) => identifier.toLowerCase()) ?? [];
  const privatePhrases = [
    input.rootCause,
    input.referenceFix,
    ...input.requiredConcepts,
  ];

  return privatePhrases.some((phrase) => {
    const normalizedPhrase = normalizedText(phrase);
    const compactPhrase = normalizedPhrase.replaceAll(" ", "");

    return (
      (normalizedPhrase.length >= 6 &&
        disclosureSurface.includes(normalizedPhrase)) ||
      (compactPhrase.length >= 6 &&
        identifiers.some((identifier) => identifier.includes(compactPhrase)))
    );
  });
}

export function validateGeneratedChallenge(
  input: unknown,
  recentFingerprints: ReadonlySet<string> = new Set(),
): GeneratedChallenge {
  const parsed = generatedChallengeSchema.safeParse(input);

  if (!parsed.success) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge failed structured validation.",
      { cause: parsed.error },
    );
  }

  const challenge = parsed.data;
  const nonEmptyLines = challenge.buggyCode
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
  const normalizedConcepts = challenge.requiredConcepts.map(normalizedText);

  if (nonEmptyLines > 25) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge exceeds 25 non-empty lines.",
    );
  }

  if (new Set(normalizedConcepts).size !== normalizedConcepts.length) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge contains duplicate required concepts.",
    );
  }

  if (
    dangerousCodePatterns.some((pattern) => pattern.test(challenge.buggyCode))
  ) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge contains a disallowed code pattern.",
    );
  }

  if (publicFieldsRevealAnswer(challenge)) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge exposes private solution information.",
    );
  }

  if (recentFingerprints.has(challengeFingerprint(challenge))) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge duplicates a recent challenge.",
    );
  }

  return {
    public: {
      id: `ai-${randomUUID()}`,
      title: challenge.title,
      scenario: challenge.scenario,
      language: challenge.language,
      topic: challenge.topic,
      difficulty: challenge.difficulty,
      buggyCode: challenge.buggyCode,
      source: "AI_GENERATED",
    },
    private: {
      rootCause: challenge.rootCause,
      referenceFix: challenge.referenceFix,
      requiredConcepts: [...challenge.requiredConcepts],
      acceptedAlternatives: [...challenge.acceptedAlternatives],
      invalidFixes: [...challenge.invalidFixes],
    },
  };
}

function responseContainsRefusal(response: unknown): boolean {
  if (!response || typeof response !== "object" || !("output" in response)) {
    return false;
  }

  const output = (response as { output?: unknown }).output;

  return (
    Array.isArray(output) &&
    output.some((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return false;
      }

      const content = (item as { content?: unknown }).content;
      return (
        Array.isArray(content) &&
        content.some(
          (part) =>
            part !== null &&
            typeof part === "object" &&
            "type" in part &&
            part.type === "refusal",
        )
      );
    })
  );
}

export class OpenAIChallengeGenerator implements ChallengeGenerator {
  private readonly recentFingerprints = new Set<string>();

  constructor(
    private readonly openai: OpenAI,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async generate(): Promise<GeneratedChallenge> {
    try {
      const response = await this.openai.responses.parse(
        {
          model: this.model,
          store: false,
          input: [{ role: "system", content: GENERATION_INSTRUCTIONS }],
          text: {
            format: zodTextFormat(
              generatedChallengeSchema,
              "bugrace_generated_challenge",
            ),
          },
        },
        { timeout: this.timeoutMs, maxRetries: 0 },
      );

      if (responseContainsRefusal(response)) {
        throw new ChallengeGenerationError(
          "REFUSED",
          "Challenge generation was refused.",
        );
      }

      if (response.status === "incomplete" || !response.output_parsed) {
        throw new ChallengeGenerationError(
          "INCOMPLETE",
          "Challenge generation returned no complete structured result.",
        );
      }

      const challenge = validateGeneratedChallenge(
        response.output_parsed,
        this.recentFingerprints,
      );
      this.recentFingerprints.add(challengeFingerprint(challenge.public));

      if (this.recentFingerprints.size > 20) {
        const oldestFingerprint = this.recentFingerprints.values().next().value;
        if (oldestFingerprint) {
          this.recentFingerprints.delete(oldestFingerprint);
        }
      }

      return challenge;
    } catch (error) {
      if (error instanceof ChallengeGenerationError) {
        throw error;
      }

      throw new ChallengeGenerationError(
        "UNAVAILABLE",
        "Challenge generation is unavailable.",
        { cause: error },
      );
    }
  }
}

type ChallengeGenerationEnvironment = Pick<
  typeof env,
  | "CHALLENGE_GENERATION_ENABLED"
  | "CHALLENGE_GENERATION_MODEL"
  | "CHALLENGE_GENERATION_TIMEOUT_MS"
>;

export function createChallengeGenerator(
  environment: ChallengeGenerationEnvironment,
  openai: OpenAI | null,
): ChallengeGenerator | null {
  if (!environment.CHALLENGE_GENERATION_ENABLED) {
    return null;
  }

  if (!openai) {
    throw new Error("OpenAI client is required for challenge generation.");
  }

  return new OpenAIChallengeGenerator(
    openai,
    environment.CHALLENGE_GENERATION_MODEL,
    environment.CHALLENGE_GENERATION_TIMEOUT_MS,
  );
}

export async function generateChallengeOrFallback(
  generator: ChallengeGenerator,
): Promise<{ challenge: StoredChallenge; fallbackUsed: boolean }> {
  try {
    return { challenge: await generator.generate(), fallbackUsed: false };
  } catch {
    return { challenge: curatedChallenge, fallbackUsed: true };
  }
}
