import { z } from "zod";

const environmentSchema = z
  .object({
    PORT: z.coerce.number().int().positive().max(65_535),
    WEB_ORIGIN: z.url(),
    RACE_DURATION_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(600_000)
      .default(120_000),
    CHALLENGE_GENERATION_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    CHALLENGE_GENERATION_MODEL: z
      .string()
      .trim()
      .min(1)
      .default("gpt-5.4-mini"),
    CHALLENGE_GENERATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(3_000)
      .max(30_000)
      .default(15_000),
    EVALUATOR_MODE: z.enum(["openai", "mock"]).default("mock"),
    OPENAI_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.6-terra"),
    OPENAI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(3_000)
      .max(30_000)
      .default(12_000),
    OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
    OPENAI_FALLBACK_MODE: z.enum(["mock", "none"]).default("mock"),
  })
  .superRefine((environment, context) => {
    if (
      (environment.EVALUATOR_MODE === "openai" ||
        environment.CHALLENGE_GENERATION_ENABLED) &&
      !environment.OPENAI_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message:
          "OPENAI_API_KEY is required for OpenAI evaluation or challenge generation.",
      });
    }
  });

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error(
    "Invalid server environment:",
    parsedEnvironment.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsedEnvironment.data;
