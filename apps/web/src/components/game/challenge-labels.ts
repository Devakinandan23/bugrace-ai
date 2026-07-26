import type {
  ChallengeDifficulty,
  ChallengeLanguage,
  RaceDurationSeconds,
} from "@bugrace/shared";

export const languageLabels: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: "JavaScript",
  TYPESCRIPT: "TypeScript",
  CPP: "C++",
  JAVA: "Java",
  PYTHON: "Python",
};

export const difficultyLabels: Record<ChallengeDifficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export const durationLabels: Record<RaceDurationSeconds, string> = {
  60: "1 minute",
  120: "2 minutes",
  180: "3 minutes",
  300: "5 minutes",
};
