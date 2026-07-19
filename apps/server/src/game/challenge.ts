import type { PublicChallenge } from "@bugrace/shared";

export const publicChallenge = {
  id: "async-map-001",
  title: "The Array of Promises",
  scenario: "Load all users by their IDs.",
  language: "typescript",
  buggyCode: `
async function getUsers(ids: number[]) {
  const users = ids.map(async (id) => {
    return await fetchUser(id);
  });

  return users;
}
  `.trim(),
} as const satisfies PublicChallenge;
