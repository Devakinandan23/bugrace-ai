import OpenAI from "openai";

import type { env } from "../config/env.js";
import type { SubmissionEvaluator } from "./evaluator.js";
import { FallbackSubmissionEvaluator } from "./fallback-evaluator.js";
import { MockSubmissionEvaluator } from "./mock-evaluator.js";
import { OpenAISubmissionEvaluator } from "./openai-evaluator.js";

type EvaluatorEnvironment = Pick<
  typeof env,
  | "EVALUATOR_MODE"
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL"
  | "OPENAI_TIMEOUT_MS"
  | "OPENAI_MAX_RETRIES"
  | "OPENAI_FALLBACK_MODE"
>;

export function createSubmissionEvaluator(
  environment: EvaluatorEnvironment,
): SubmissionEvaluator {
  const mockEvaluator = new MockSubmissionEvaluator();

  if (environment.EVALUATOR_MODE === "mock") {
    return mockEvaluator;
  }

  const openai = new OpenAI({
    apiKey: environment.OPENAI_API_KEY,
    timeout: environment.OPENAI_TIMEOUT_MS,
    maxRetries: environment.OPENAI_MAX_RETRIES,
  });
  const openaiEvaluator = new OpenAISubmissionEvaluator(
    openai,
    environment.OPENAI_MODEL,
  );

  return new FallbackSubmissionEvaluator(
    openaiEvaluator,
    environment.OPENAI_FALLBACK_MODE === "mock" ? mockEvaluator : null,
  );
}
