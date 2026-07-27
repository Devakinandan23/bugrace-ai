import type { PublicChallenge, PublicRoomSettings } from "@bugrace/shared";

import {
  createCuratedPublicChallenge,
  getCuratedChallengeVariantCount,
  publicChallenge,
} from "./challenge.js";
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

const nextVariantBySettings = new Map<string, number>();

export function getCuratedChallenge(
  settings: PublicRoomSettings,
): StoredChallenge {
  const selectionKey = `${settings.language}:${settings.difficulty}`;
  const variantCount = getCuratedChallengeVariantCount(settings.difficulty);
  const variantIndex = nextVariantBySettings.get(selectionKey) ?? 0;
  nextVariantBySettings.set(selectionKey, (variantIndex + 1) % variantCount);

  return {
    public: createCuratedPublicChallenge(settings, variantIndex),
    private: createPrivateEvaluationData(
      settings.language,
      settings.difficulty,
      variantIndex,
    ),
  };
}
