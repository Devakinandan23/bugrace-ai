import OpenAI from "openai";

import type { env } from "./config/env.js";

type OpenAIEnvironment = Pick<
  typeof env,
  | "CHALLENGE_GENERATION_ENABLED"
  | "EVALUATOR_MODE"
  | "OPENAI_API_KEY"
  | "OPENAI_TIMEOUT_MS"
  | "OPENAI_MAX_RETRIES"
>;

export function createOpenAIClient(
  environment: OpenAIEnvironment,
): OpenAI | null {
  if (
    environment.EVALUATOR_MODE === "mock" &&
    !environment.CHALLENGE_GENERATION_ENABLED
  ) {
    return null;
  }

  return new OpenAI({
    apiKey: environment.OPENAI_API_KEY,
    timeout: environment.OPENAI_TIMEOUT_MS,
    maxRetries: environment.OPENAI_MAX_RETRIES,
  });
}
