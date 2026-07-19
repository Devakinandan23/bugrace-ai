import type { PublicChallenge } from "@bugrace/shared";

import { publicChallenge } from "./challenge.js";
import { privateEvaluationData } from "./private-evaluation.js";

export interface ChallengePrivateData {
  rootCause: string;
  referenceFix: string;
  requiredConcepts: readonly string[];
  acceptedAlternatives: readonly string[];
  invalidFixes: readonly string[];
}

export interface StoredChallenge {
  public: PublicChallenge;
  private: ChallengePrivateData;
}

export interface GeneratedChallenge {
  public: PublicChallenge & { source: "AI_GENERATED" };
  private: ChallengePrivateData;
}

export const curatedChallenge: StoredChallenge = {
  public: publicChallenge,
  private: privateEvaluationData,
};
