import type {
  ChallengeLanguage,
  PublicChallenge,
  PublicRoomSettings,
} from "@bugrace/shared";

const buggyCodeByLanguage: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: `
async function getUsers(ids) {
  const users = ids.map(async (id) => {
    return await fetchUser(id);
  });

  return users;
}
  `.trim(),
  TYPESCRIPT: `
async function getUsers(ids: number[]) {
  const users = ids.map(async (id) => {
    return await fetchUser(id);
  });

  return users;
}
  `.trim(),
  CPP: `
std::vector<User> getUsers(const std::vector<int>& ids) {
  std::vector<std::future<User>> users;
  for (int id : ids) {
    users.push_back(fetchUser(id));
  }

  return users;
}
  `.trim(),
  JAVA: `
List<User> getUsers(List<Integer> ids) {
  List<CompletableFuture<User>> users = ids.stream()
      .map(this::fetchUser)
      .toList();

  return users;
}
  `.trim(),
  PYTHON: `
async def get_users(ids):
    users = [fetch_user(user_id) for user_id in ids]
    return users
  `.trim(),
};

export function createCuratedPublicChallenge(
  settings: PublicRoomSettings,
): PublicChallenge {
  return {
    id: `async-collection-${settings.language.toLowerCase()}-${settings.difficulty.toLowerCase()}`,
    title: "The Unresolved User Collection",
    scenario: "Load all users by their IDs before returning the collection.",
    language: settings.language,
    difficulty: settings.difficulty,
    buggyCode: buggyCodeByLanguage[settings.language],
    source: "CURATED",
  };
}

export const publicChallenge = createCuratedPublicChallenge({
  language: "TYPESCRIPT",
  difficulty: "MEDIUM",
  durationSeconds: 120,
});
