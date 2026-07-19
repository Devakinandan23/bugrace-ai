import type OpenAI from "openai";

import type { env } from "../config/env.js";
import type { SubmissionEvaluator } from "./evaluator.js";
import { FallbackSubmissionEvaluator } from "./fallback-evaluator.js";
import { MockSubmissionEvaluator } from "./mock-evaluator.js";
import { OpenAISubmissionEvaluator } from "./openai-evaluator.js";

type EvaluatorEnvironment = Pick<
  typeof env,
  "EVALUATOR_MODE" | "OPENAI_MODEL" | "OPENAI_FALLBACK_MODE"
>;

export function createSubmissionEvaluator(
  environment: EvaluatorEnvironment,
  openai: OpenAI | null,
): SubmissionEvaluator {
  const mockEvaluator = new MockSubmissionEvaluator();

  if (environment.EVALUATOR_MODE === "mock") {
    return mockEvaluator;
  }

  if (!openai) {
    throw new Error("OpenAI client is required in OpenAI evaluator mode.");
  }

  const openaiEvaluator = new OpenAISubmissionEvaluator(
    openai,
    environment.OPENAI_MODEL,
  );

  return new FallbackSubmissionEvaluator(
    openaiEvaluator,
    environment.OPENAI_FALLBACK_MODE === "mock" ? mockEvaluator : null,
  );
}
