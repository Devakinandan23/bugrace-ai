import { randomUUID } from "node:crypto";

import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ChallengeDifficulty, PublicRoomSettings } from "@bugrace/shared";
import { z } from "zod";

import type { env } from "../config/env.js";
import {
  getCuratedChallenge,
  type GeneratedChallenge,
  type StoredChallenge,
} from "./challenge-data.js";

const GENERATION_INSTRUCTIONS = `Create one compact debugging challenge for a multiplayer developer game.

The challenge must contain exactly one primary technical defect.

It must be solvable by reading and reasoning about the code. It must
not require execution, external files, dependencies or internet access.

The buggy code must contain at most 25 non-empty lines.
The buggy code must use the requested language and valid syntax for that
language. The challenge difficulty must be appropriate to the requested level.
Use the requested category and do not replace it with a similar category.

Difficulty rules:
- EASY: 5-10 non-empty lines. Use only familiar beginner constructs such as
  variables, if statements, basic loops, arrays/lists, strings, object fields
  and function returns. The defect must be directly visible. Do not use async,
  promises, futures, coroutines, concurrency, advanced generics or obscure
  library APIs.
- MEDIUM: 10-18 non-empty lines. The defect may span a few related lines and
  may involve common collection transformations, error handling, state updates,
  validation or familiar asynchronous code.
- HARD: 15-25 non-empty lines. The defect may involve concurrency, ordering,
  shared mutation, stale state, resource cleanup or language-specific behavior.

Prefer methods and functions commonly taught and used in the requested
language. Avoid framework-specific APIs unless the requested category requires
them.

Provide:
- a short title;
- a realistic scenario;
- buggy code in the requested language;
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

const challengeCategories = [
  "CONDITIONAL_LOGIC",
  "LOOP_BOUNDARY",
  "MISSING_RETURN",
  "WRONG_VARIABLE",
  "STRING_OR_COLLECTION",
  "ASYNC_COLLECTION",
  "ERROR_HANDLING",
  "STATE_UPDATE",
  "COLLECTION_TRANSFORM",
  "DATA_VALIDATION",
  "CONCURRENCY_ORDERING",
  "SHARED_MUTATION",
  "STALE_STATE",
  "RESOURCE_CLEANUP",
  "LANGUAGE_SEMANTICS",
] as const;

type ChallengeCategory = (typeof challengeCategories)[number];

const categoriesByDifficulty: Record<
  ChallengeDifficulty,
  readonly ChallengeCategory[]
> = {
  EASY: [
    "CONDITIONAL_LOGIC",
    "LOOP_BOUNDARY",
    "MISSING_RETURN",
    "WRONG_VARIABLE",
    "STRING_OR_COLLECTION",
  ],
  MEDIUM: [
    "ASYNC_COLLECTION",
    "ERROR_HANDLING",
    "STATE_UPDATE",
    "COLLECTION_TRANSFORM",
    "DATA_VALIDATION",
  ],
  HARD: [
    "CONCURRENCY_ORDERING",
    "SHARED_MUTATION",
    "STALE_STATE",
    "RESOURCE_CLEANUP",
    "LANGUAGE_SEMANTICS",
  ],
};

const maximumLinesByDifficulty: Record<ChallengeDifficulty, number> = {
  EASY: 10,
  MEDIUM: 18,
  HARD: 25,
};

const easyDisallowedConceptPattern =
  /\b(?:async|await|promise|future|coroutine|concurren(?:cy|t)|thread|mutex|semaphore|race condition)\b/i;

export const generatedChallengeSchema = z
  .object({
    category: z.enum(challengeCategories),
    title: z.string().trim().min(5).max(80),
    scenario: z.string().trim().min(20).max(300),
    language: z.enum(["JAVASCRIPT", "TYPESCRIPT", "CPP", "JAVA", "PYTHON"]),
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
  generate(settings: PublicRoomSettings): Promise<GeneratedChallenge>;
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
  /os\s*\.\s*environ/i,
  /\bsubprocess\b/i,
  /shutil\s*\.\s*rmtree/i,
  /os\s*\.\s*(?:remove|unlink|system)\s*\(/i,
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

function codeComments(
  code: string,
  language: GeneratedChallengeOutput["language"],
): string {
  const comments =
    language === "PYTHON"
      ? code.match(/#.*$/gm)
      : code.match(/\/\/.*$|\/\*[\s\S]*?\*\//gm);
  return comments?.join("\n") ?? "";
}

function publicFieldsRevealAnswer(input: GeneratedChallengeOutput): boolean {
  const disclosureSurface = normalizedText(
    `${input.title}\n${input.scenario}\n${codeComments(input.buggyCode, input.language)}`,
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
  settings: PublicRoomSettings,
  recentFingerprints: ReadonlySet<string> = new Set(),
  requestedCategory?: ChallengeCategory,
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

  if (challenge.language !== settings.language) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge language does not match the room language.",
    );
  }

  if (challenge.difficulty !== settings.difficulty) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge difficulty does not match the room difficulty.",
    );
  }

  if (
    !categoriesByDifficulty[settings.difficulty].includes(challenge.category)
  ) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge category does not match the requested difficulty.",
    );
  }

  if (requestedCategory && challenge.category !== requestedCategory) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated challenge does not match the requested category.",
    );
  }

  if (nonEmptyLines > maximumLinesByDifficulty[settings.difficulty]) {
    throw new ChallengeGenerationError(
      "INVALID",
      `Generated ${settings.difficulty.toLowerCase()} challenge exceeds its line limit.`,
    );
  }

  if (
    settings.difficulty === "EASY" &&
    easyDisallowedConceptPattern.test(
      [
        challenge.buggyCode,
        challenge.rootCause,
        challenge.referenceFix,
        ...challenge.requiredConcepts,
      ].join("\n"),
    )
  ) {
    throw new ChallengeGenerationError(
      "INVALID",
      "Generated easy challenge uses concepts reserved for harder difficulties.",
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
  private readonly nextCategoryIndex: Record<ChallengeDifficulty, number> = {
    EASY: 0,
    MEDIUM: 0,
    HARD: 0,
  };

  constructor(
    private readonly openai: OpenAI,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async generate(settings: PublicRoomSettings): Promise<GeneratedChallenge> {
    try {
      const categories = categoriesByDifficulty[settings.difficulty];
      const categoryIndex =
        this.nextCategoryIndex[settings.difficulty] % categories.length;
      const category = categories[categoryIndex];

      const response = await this.openai.responses.parse(
        {
          model: this.model,
          store: false,
          input: [
            { role: "system", content: GENERATION_INSTRUCTIONS },
            {
              role: "user",
              content: JSON.stringify({
                language: settings.language,
                difficulty: settings.difficulty,
                category,
              }),
            },
          ],
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
        settings,
        this.recentFingerprints,
        category,
      );
      this.recentFingerprints.add(challengeFingerprint(challenge.public));
      this.nextCategoryIndex[settings.difficulty] = categoryIndex + 1;

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
  settings: PublicRoomSettings,
): Promise<{ challenge: StoredChallenge; fallbackUsed: boolean }> {
  try {
    const challenge = await generator.generate(settings);

    if (
      challenge.public.language !== settings.language ||
      challenge.public.difficulty !== settings.difficulty
    ) {
      throw new ChallengeGenerationError(
        "INVALID",
        "Generated challenge settings do not match the room.",
      );
    }

    return {
      challenge,
      fallbackUsed: false,
    };
  } catch {
    return {
      challenge: getCuratedChallenge(settings),
      fallbackUsed: true,
    };
  }
}
