import type { PublicChallenge, PublicRoomSettings } from "@bugrace/shared";

import { createCuratedPublicChallenge, publicChallenge } from "./challenge.js";
import {
  createPrivateEvaluationData,
  privateEvaluationData,
} from "./private-evaluation.js";

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

export function getCuratedChallenge(
  settings: PublicRoomSettings,
): StoredChallenge {
  return {
    public: createCuratedPublicChallenge(settings),
    private: createPrivateEvaluationData(settings.language),
  };
}
