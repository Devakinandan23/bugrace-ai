import type {
  ChallengeDifficulty,
  ChallengeLanguage,
  PublicChallenge,
  PublicRoomSettings,
} from "@bugrace/shared";

const missingReturnCodeByLanguage: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: `
function discountedPrice(price, percent) {
  const discount = price * (percent / 100);
  const finalPrice = price - discount;
}
  `.trim(),
  TYPESCRIPT: `
function discountedPrice(price: number, percent: number): number {
  const discount = price * (percent / 100);
  const finalPrice = price - discount;
}
  `.trim(),
  CPP: `
double discountedPrice(double price, double percent) {
  double discount = price * (percent / 100);
  double finalPrice = price - discount;
}
  `.trim(),
  JAVA: `
double discountedPrice(double price, double percent) {
  double discount = price * (percent / 100);
  double finalPrice = price - discount;
}
  `.trim(),
  PYTHON: `
def discounted_price(price, percent):
    discount = price * (percent / 100)
    final_price = price - discount
  `.trim(),
};

const reversedConditionCodeByLanguage: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: `
function hasFreeShipping(total) {
  if (total <= 50) {
    return true;
  }
  return false;
}
  `.trim(),
  TYPESCRIPT: `
function hasFreeShipping(total: number): boolean {
  if (total <= 50) {
    return true;
  }
  return false;
}
  `.trim(),
  CPP: `
bool hasFreeShipping(double total) {
  if (total <= 50) {
    return true;
  }
  return false;
}
  `.trim(),
  JAVA: `
boolean hasFreeShipping(double total) {
  if (total <= 50) {
    return true;
  }
  return false;
}
  `.trim(),
  PYTHON: `
def has_free_shipping(total):
    if total <= 50:
        return True
    return False
  `.trim(),
};

const loopBoundaryCodeByLanguage: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: `
function totalScores(scores) {
  let total = 0;
  for (let index = 0; index < scores.length - 1; index++) {
    total += scores[index];
  }
  return total;
}
  `.trim(),
  TYPESCRIPT: `
function totalScores(scores: number[]): number {
  let total = 0;
  for (let index = 0; index < scores.length - 1; index++) {
    total += scores[index];
  }
  return total;
}
  `.trim(),
  CPP: `
int totalScores(const std::vector<int>& scores) {
  int total = 0;
  for (size_t index = 0; index + 1 < scores.size(); index++) {
    total += scores[index];
  }
  return total;
}
  `.trim(),
  JAVA: `
int totalScores(List<Integer> scores) {
  int total = 0;
  for (int index = 0; index < scores.size() - 1; index++) {
    total += scores.get(index);
  }
  return total;
}
  `.trim(),
  PYTHON: `
def total_scores(scores):
    total = 0
    for index in range(len(scores) - 1):
        total += scores[index]
    return total
  `.trim(),
};

const wrongReturnCodeByLanguage: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: `
function finalScore(points, bonus) {
  const total = points + bonus;
  return points;
}
  `.trim(),
  TYPESCRIPT: `
function finalScore(points: number, bonus: number): number {
  const total = points + bonus;
  return points;
}
  `.trim(),
  CPP: `
int finalScore(int points, int bonus) {
  int total = points + bonus;
  return points;
}
  `.trim(),
  JAVA: `
int finalScore(int points, int bonus) {
  int total = points + bonus;
  return points;
}
  `.trim(),
  PYTHON: `
def final_score(points, bonus):
    total = points + bonus
    return points
  `.trim(),
};

const unchangedValueCodeByLanguage: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: `
function stockAfterSale(stock, sold) {
  let remaining = stock;
  remaining - sold;
  return remaining;
}
  `.trim(),
  TYPESCRIPT: `
function stockAfterSale(stock: number, sold: number): number {
  let remaining = stock;
  remaining - sold;
  return remaining;
}
  `.trim(),
  CPP: `
int stockAfterSale(int stock, int sold) {
  int remaining = stock;
  remaining - sold;
  return remaining;
}
  `.trim(),
  JAVA: `
int stockAfterSale(int stock, int sold) {
  int remaining = stock;
  remaining - sold;
  return remaining;
}
  `.trim(),
  PYTHON: `
def stock_after_sale(stock, sold):
    remaining = stock
    remaining - sold
    return remaining
  `.trim(),
};

const easyChallenges = [
  {
    id: "missing-return",
    title: "The Missing Checkout Result",
    scenario:
      "A checkout helper calculates a discounted price, but callers receive no usable result.",
    codeByLanguage: missingReturnCodeByLanguage,
  },
  {
    id: "reversed-condition",
    title: "The Backwards Shipping Rule",
    scenario:
      "Orders of 50 or more should receive free shipping, but the checkout applies it to smaller orders.",
    codeByLanguage: reversedConditionCodeByLanguage,
  },
  {
    id: "loop-boundary",
    title: "The Missing Final Score",
    scenario:
      "A quiz total is consistently short because one score is not included in the calculation.",
    codeByLanguage: loopBoundaryCodeByLanguage,
  },
  {
    id: "wrong-return",
    title: "The Forgotten Bonus",
    scenario:
      "A game calculates the final score with a bonus, but the displayed result leaves the bonus out.",
    codeByLanguage: wrongReturnCodeByLanguage,
  },
  {
    id: "unchanged-value",
    title: "The Stock That Never Changes",
    scenario:
      "An inventory helper should subtract sold items, but it keeps returning the original stock.",
    codeByLanguage: unchangedValueCodeByLanguage,
  },
] as const;

const mediumBuggyCodeByLanguage: Record<ChallengeLanguage, string> = {
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

const hardBuggyCodeByLanguage: Record<ChallengeLanguage, string> = {
  JAVASCRIPT: `
let remainingSeats = 10;

async function reserveSeats(count) {
  if (remainingSeats < count) return false;
  const nextRemaining = remainingSeats - count;
  await saveReservation(count);
  remainingSeats = nextRemaining;
  return true;
}
  `.trim(),
  TYPESCRIPT: `
let remainingSeats = 10;

async function reserveSeats(count: number): Promise<boolean> {
  if (remainingSeats < count) return false;
  const nextRemaining = remainingSeats - count;
  await saveReservation(count);
  remainingSeats = nextRemaining;
  return true;
}
  `.trim(),
  CPP: `
int remainingSeats = 10;

bool reserveSeats(int count) {
  if (remainingSeats < count) return false;
  int nextRemaining = remainingSeats - count;
  saveReservation(count);
  remainingSeats = nextRemaining;
  return true;
}
  `.trim(),
  JAVA: `
private int remainingSeats = 10;

boolean reserveSeats(int count) {
  if (remainingSeats < count) return false;
  int nextRemaining = remainingSeats - count;
  saveReservation(count);
  remainingSeats = nextRemaining;
  return true;
}
  `.trim(),
  PYTHON: `
remaining_seats = 10

async def reserve_seats(count):
    global remaining_seats
    if remaining_seats < count:
        return False
    next_remaining = remaining_seats - count
    await save_reservation(count)
    remaining_seats = next_remaining
    return True
  `.trim(),
};

export function createCuratedPublicChallenge(
  settings: PublicRoomSettings,
  variantIndex = 0,
): PublicChallenge {
  if (settings.difficulty === "EASY") {
    const challenge =
      easyChallenges[variantIndex % easyChallenges.length] ?? easyChallenges[0];

    return {
      id: `${challenge.id}-${settings.language.toLowerCase()}-easy`,
      title: challenge.title,
      scenario: challenge.scenario,
      language: settings.language,
      difficulty: settings.difficulty,
      buggyCode: challenge.codeByLanguage[settings.language],
      source: "CURATED",
    };
  }

  if (settings.difficulty === "HARD") {
    return {
      id: `seat-reservation-race-${settings.language.toLowerCase()}-hard`,
      title: "The Double-Booked Seats",
      scenario:
        "Two reservations made at nearly the same time can both succeed even when there are not enough seats.",
      language: settings.language,
      difficulty: settings.difficulty,
      buggyCode: hardBuggyCodeByLanguage[settings.language],
      source: "CURATED",
    };
  }

  return {
    id: `async-collection-${settings.language.toLowerCase()}-medium`,
    title: "The Unresolved User Collection",
    scenario: "Load all users by their IDs before returning the collection.",
    language: settings.language,
    difficulty: settings.difficulty,
    buggyCode: mediumBuggyCodeByLanguage[settings.language],
    source: "CURATED",
  };
}

export function getCuratedChallengeVariantCount(
  difficulty: ChallengeDifficulty,
): number {
  return difficulty === "EASY" ? easyChallenges.length : 1;
}

export const publicChallenge = createCuratedPublicChallenge({
  language: "TYPESCRIPT",
  difficulty: "MEDIUM",
  durationSeconds: 120,
});
