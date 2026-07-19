import type { EvaluationSource } from "@bugrace/shared";

export type RootCauseScore = 0 | 10 | 20 | 35;
export type FixScore = 0 | 10 | 20 | 35;
export type ReasoningScore = 0 | 5 | 10 | 15 | 20;

export interface SemanticEvaluation {
  confidence: number;
  rootCauseScore: RootCauseScore;
  fixScore: FixScore;
  reasoningScore: ReasoningScore;
  feedback: string;
  detectedConcepts: string[];
  missingConcepts: string[];
  source: EvaluationSource;
}

export interface EvaluationInput {
  challenge: {
    title: string;
    scenario: string;
    language: string;
    buggyCode: string;
  };
  rubric: {
    rootCause: string;
    referenceFix: string;
    requiredConcepts: string[];
  };
  submission: {
    explanation: string;
    proposedFix: string;
  };
}

export interface SubmissionEvaluator {
  evaluate(input: EvaluationInput): Promise<SemanticEvaluation>;
}

export type EvaluationFailureCode =
  | "EVALUATION_TIMEOUT"
  | "EVALUATION_REFUSED"
  | "EVALUATION_INVALID"
  | "EVALUATION_UNAVAILABLE";

export class EvaluationError extends Error {
  constructor(
    readonly code: EvaluationFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EvaluationError";
  }
}
