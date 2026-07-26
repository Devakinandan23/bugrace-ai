import assert from "node:assert/strict";
import test from "node:test";

import type { BugRaceServer } from "../realtime/register-socket-handlers.js";
import type { StoredChallenge } from "./challenge-data.js";
import type { SemanticEvaluation } from "./evaluator.js";
import { advanceRace } from "./race-deadline.js";
import {
  activateRace,
  advanceRaceState,
  completeSubmissionEvaluation,
  completeRacePreparation,
  createRoom,
  failSubmissionEvaluation,
  joinRoom,
  recoverRacePreparationWithCuratedChallenge,
  reserveSubmission,
  startRace,
  updateRoomSettings,
  type RaceStartData,
  type ReadyRaceStartData,
} from "./room-service.js";
import { mockSubmissionEvaluator } from "./mock-evaluator.js";

function expectSuccess<T>(result: { ok: true; data: T } | { ok: false }): T {
  assert.equal(result.ok, true);
  return (result as { ok: true; data: T }).data;
}

function expectReadyStart(
  result: { ok: true; data: RaceStartData } | { ok: false },
): ReadyRaceStartData {
  const data = expectSuccess(result);
  assert.equal(data.generationRequested, false);
  return data as ReadyRaceStartData;
}

function createActiveRace(hostName: string, guestName: string, suffix: string) {
  const host = expectSuccess(
    createRoom({ username: hostName }, `host-${suffix}`, false),
  );
  const guest = expectSuccess(
    joinRoom(
      { username: guestName, roomCode: host.room.code },
      `guest-${suffix}`,
      false,
    ),
  );
  const started = expectReadyStart(
    startRace({ roomCode: host.room.code }, host.playerId, host.room.code),
  );

  assert.ok(activateRace(host.room.code, started.startsAt));
  return { host, guest, started };
}

function validPayload(roomCode: string) {
  return {
    roomCode,
    explanation: "The async map returns an array of promises.",
    proposedFix: "return Promise.all(ids.map(fetchUser));",
  };
}

function semanticEvaluation(
  rootCauseScore: 0 | 10 | 20 | 35,
  fixScore: 0 | 10 | 20 | 35,
  reasoningScore: 0 | 5 | 10 | 15 | 20,
): SemanticEvaluation {
  return {
    confidence: 1,
    rootCauseScore,
    fixScore,
    reasoningScore,
    feedback: "Deterministic test evaluation.",
    detectedConcepts: [],
    missingConcepts: [],
    source: "MOCK",
  };
}

function generatedChallenge(
  language:
    "JAVASCRIPT" | "TYPESCRIPT" | "CPP" | "JAVA" | "PYTHON" = "TYPESCRIPT",
  difficulty: "EASY" | "MEDIUM" | "HARD" = "MEDIUM",
): StoredChallenge {
  return {
    public: {
      id: "ai-room-test",
      title: "Overlapping Balance Updates",
      scenario:
        "Two account adjustments overlap and one completed change disappears.",
      language,
      difficulty,
      buggyCode:
        "const account = await read(id);\nawait write(id, account.balance + delta);",
      source: "AI_GENERATED",
    },
    private: {
      rootCause:
        "The read-modify-write sequence races and can overwrite a concurrent update.",
      referenceFix: "Use an atomic increment or a locked transaction.",
      requiredConcepts: ["atomic update", "concurrent write"],
      acceptedAlternatives: ["Use optimistic concurrency and retry conflicts."],
      invalidFixes: ["Await the write twice."],
    },
  };
}

test("new rooms default to TypeScript, Medium, and two minutes", () => {
  const host = expectSuccess(
    createRoom({ username: "Default Host" }, "default-settings-host", false),
  );

  assert.deepEqual(host.room.settings, {
    language: "TYPESCRIPT",
    difficulty: "MEDIUM",
    durationSeconds: 120,
  });
});

test("host can update language, difficulty, and race duration", () => {
  const host = expectSuccess(
    createRoom({ username: "Settings Host" }, "settings-host", false),
  );

  const languageUpdate = expectSuccess(
    updateRoomSettings(
      {
        roomCode: host.room.code,
        language: "PYTHON",
        difficulty: "MEDIUM",
        durationSeconds: 120,
      },
      host.playerId,
      host.room.code,
    ),
  );
  assert.equal(languageUpdate.settings.language, "PYTHON");

  const difficultyUpdate = expectSuccess(
    updateRoomSettings(
      {
        roomCode: host.room.code,
        language: "PYTHON",
        difficulty: "HARD",
        durationSeconds: 300,
      },
      host.playerId,
      host.room.code,
    ),
  );
  assert.equal(difficultyUpdate.settings.difficulty, "HARD");
  assert.equal(difficultyUpdate.settings.durationSeconds, 300);
});

test("Python selection starts a matching curated challenge", () => {
  const host = expectSuccess(
    createRoom({ username: "Python Host" }, "python-host", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Python Guest", roomCode: host.room.code },
      "python-guest",
      false,
    ),
  );
  expectSuccess(
    updateRoomSettings(
      {
        roomCode: host.room.code,
        language: "PYTHON",
        difficulty: "MEDIUM",
        durationSeconds: 120,
      },
      host.playerId,
      host.room.code,
    ),
  );

  const started = expectReadyStart(
    startRace({ roomCode: host.room.code }, host.playerId, host.room.code),
  );

  assert.equal(started.challenge.language, "PYTHON");
  assert.match(started.challenge.buggyCode, /async def get_users/);
});

test("non-host cannot update room settings", () => {
  const host = expectSuccess(
    createRoom({ username: "Host Settings" }, "settings-owner", false),
  );
  const guest = expectSuccess(
    joinRoom(
      { username: "Guest Settings", roomCode: host.room.code },
      "settings-guest",
      false,
    ),
  );
  const result = updateRoomSettings(
    {
      roomCode: host.room.code,
      language: "CPP",
      difficulty: "HARD",
      durationSeconds: 120,
    },
    guest.playerId,
    host.room.code,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "HOST_ONLY");
  }
});

test("invalid language and difficulty use stable errors", () => {
  const host = expectSuccess(
    createRoom({ username: "Validation Host" }, "validation-host", false),
  );
  const invalidLanguage = updateRoomSettings(
    {
      roomCode: host.room.code,
      language: "RUBY",
      difficulty: "MEDIUM",
      durationSeconds: 120,
    },
    host.playerId,
    host.room.code,
  );
  const invalidDifficulty = updateRoomSettings(
    {
      roomCode: host.room.code,
      language: "TYPESCRIPT",
      difficulty: "EXTREME",
      durationSeconds: 120,
    },
    host.playerId,
    host.room.code,
  );

  assert.equal(invalidLanguage.ok, false);
  assert.equal(invalidDifficulty.ok, false);
  if (!invalidLanguage.ok) {
    assert.equal(invalidLanguage.error.code, "INVALID_LANGUAGE");
  }
  if (!invalidDifficulty.ok) {
    assert.equal(invalidDifficulty.error.code, "INVALID_DIFFICULTY");
  }
});

test("invalid race duration uses a stable error", () => {
  const host = expectSuccess(
    createRoom({ username: "Duration Host" }, "duration-host", false),
  );
  const result = updateRoomSettings(
    {
      roomCode: host.room.code,
      language: "TYPESCRIPT",
      difficulty: "MEDIUM",
      durationSeconds: 90,
    },
    host.playerId,
    host.room.code,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_DURATION");
  }
});

test("settings cannot change after race preparation starts", () => {
  const host = expectSuccess(
    createRoom({ username: "Prepared Host" }, "prepared-host", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Prepared Guest", roomCode: host.room.code },
      "prepared-guest",
      false,
    ),
  );
  expectSuccess(
    startRace(
      { roomCode: host.room.code, generateChallenge: true },
      host.playerId,
      host.room.code,
      true,
    ),
  );

  const result = updateRoomSettings(
    {
      roomCode: host.room.code,
      language: "JAVA",
      difficulty: "HARD",
      durationSeconds: 300,
    },
    host.playerId,
    host.room.code,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "ROOM_NOT_CONFIGURABLE");
  }
});

test("all room members receive the same stored settings", () => {
  const host = expectSuccess(
    createRoom({ username: "Shared Host" }, "shared-settings-host", false),
  );
  const updated = expectSuccess(
    updateRoomSettings(
      {
        roomCode: host.room.code,
        language: "CPP",
        difficulty: "EASY",
        durationSeconds: 60,
      },
      host.playerId,
      host.room.code,
    ),
  );
  const guest = expectSuccess(
    joinRoom(
      { username: "Shared Guest", roomCode: host.room.code },
      "shared-settings-guest",
      false,
    ),
  );

  assert.deepEqual(guest.room.settings, updated.settings);
});

test("non-host AI generation request is rejected", () => {
  const host = expectSuccess(
    createRoom({ username: "Generation Host" }, "generation-host", false),
  );
  const guest = expectSuccess(
    joinRoom(
      { username: "Generation Guest", roomCode: host.room.code },
      "generation-guest",
      false,
    ),
  );

  const result = startRace(
    { roomCode: host.room.code, generateChallenge: true },
    guest.playerId,
    host.room.code,
    true,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "HOST_ONLY");
  }
});

test("disabled challenge generation preserves the curated start path", () => {
  const host = expectSuccess(
    createRoom({ username: "Curated Host" }, "curated-host", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Curated Guest", roomCode: host.room.code },
      "curated-guest",
      false,
    ),
  );

  const started = expectReadyStart(
    startRace(
      { roomCode: host.room.code, generateChallenge: true },
      host.playerId,
      host.room.code,
      false,
    ),
  );

  assert.equal(started.challenge.source, "CURATED");
  assert.equal(started.room.status, "COUNTDOWN");
});

test("duplicate start produces one AI generation reservation", () => {
  const host = expectSuccess(
    createRoom({ username: "Single Generator" }, "single-generator", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Generator Guest", roomCode: host.room.code },
      "single-generator-guest",
      false,
    ),
  );
  const starts = [
    startRace(
      { roomCode: host.room.code, generateChallenge: true },
      host.playerId,
      host.room.code,
      true,
    ),
    startRace(
      { roomCode: host.room.code, generateChallenge: true },
      host.playerId,
      host.room.code,
      true,
    ),
  ];
  const generationRequests = starts.filter(
    (result) => result.ok && result.data.generationRequested,
  );

  assert.equal(generationRequests.length, 1);
  assert.equal(starts[0]?.ok, true);
  assert.equal(starts[1]?.ok, false);
});

test("stored generated challenge stays public/private separated and drives evaluation", () => {
  const host = expectSuccess(
    createRoom({ username: "Stored Host" }, "stored-host", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Stored Guest", roomCode: host.room.code },
      "stored-guest",
      false,
    ),
  );
  expectSuccess(
    updateRoomSettings(
      {
        roomCode: host.room.code,
        language: "JAVA",
        difficulty: "HARD",
        durationSeconds: 180,
      },
      host.playerId,
      host.room.code,
    ),
  );
  const preparation = expectSuccess(
    startRace(
      { roomCode: host.room.code, generateChallenge: true },
      host.playerId,
      host.room.code,
      true,
    ),
  );
  assert.equal(preparation.generationRequested, true);

  const challenge = generatedChallenge("JAVA", "HARD");
  const ready = completeRacePreparation(host.room.code, challenge);

  assert.ok(ready);
  assert.deepEqual(ready.challenge, challenge.public);
  const publicPayload = JSON.stringify({
    room: ready.room,
    challenge: ready.challenge,
    startsAt: ready.startsAt,
    endsAt: ready.endsAt,
  });
  assert.equal(publicPayload.includes(challenge.private.rootCause), false);
  assert.equal(publicPayload.includes(challenge.private.referenceFix), false);
  assert.equal(publicPayload.includes("acceptedAlternatives"), false);
  assert.equal(publicPayload.includes("invalidFixes"), false);

  assert.ok(activateRace(host.room.code, ready.startsAt));
  const reservation = expectSuccess(
    reserveSubmission(
      validPayload(host.room.code),
      host.playerId,
      host.room.code,
      ready.startsAt,
    ),
  );

  assert.equal(reservation.challengeId, challenge.public.id);
  assert.equal(
    reservation.evaluationInput.challenge.buggyCode,
    challenge.public.buggyCode,
  );
  assert.equal(
    reservation.evaluationInput.challenge.language,
    ready.room.settings.language,
  );
  assert.equal(
    reservation.evaluationInput.challenge.difficulty,
    ready.room.settings.difficulty,
  );
  assert.equal(
    reservation.evaluationInput.rubric.rootCause,
    challenge.private.rootCause,
  );
  assert.deepEqual(
    reservation.evaluationInput.rubric.acceptedAlternatives,
    challenge.private.acceptedAlternatives,
  );
});

test("invalid generated challenge recovers with a curated countdown", () => {
  const host = expectSuccess(
    createRoom({ username: "Recovery Host" }, "recovery-host", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Recovery Guest", roomCode: host.room.code },
      "recovery-guest",
      false,
    ),
  );
  expectSuccess(
    startRace(
      { roomCode: host.room.code, generateChallenge: true },
      host.playerId,
      host.room.code,
      true,
    ),
  );

  const incompatibleChallenge = generatedChallenge("JAVA", "HARD");
  assert.equal(
    completeRacePreparation(host.room.code, incompatibleChallenge),
    null,
  );

  const recovered = recoverRacePreparationWithCuratedChallenge(host.room.code);

  assert.ok(recovered);
  assert.equal(recovered.room.status, "COUNTDOWN");
  assert.equal(recovered.challenge.source, "CURATED");
  assert.equal(recovered.challenge.language, "TYPESCRIPT");
  assert.equal(recovered.challenge.difficulty, "MEDIUM");
});

test("selected race duration determines the authoritative deadline", () => {
  const host = expectSuccess(
    createRoom({ username: "Timed Host" }, "timed-host", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Timed Guest", roomCode: host.room.code },
      "timed-guest",
      false,
    ),
  );
  expectSuccess(
    updateRoomSettings(
      {
        roomCode: host.room.code,
        language: "TYPESCRIPT",
        difficulty: "MEDIUM",
        durationSeconds: 60,
      },
      host.playerId,
      host.room.code,
    ),
  );

  const started = expectReadyStart(
    startRace({ roomCode: host.room.code }, host.playerId, host.room.code),
  );

  assert.equal(started.room.settings.durationSeconds, 60);
  assert.equal(started.endsAt - started.startsAt, 60_000);
});

test("deadline results rank submissions before alphabetical timeouts and stay immutable", async () => {
  const host = expectSuccess(
    createRoom({ username: "Zoe" }, "host-socket", false),
  );
  const guest = expectSuccess(
    joinRoom(
      { username: "Ada", roomCode: host.room.code },
      "guest-socket",
      false,
    ),
  );
  const started = expectReadyStart(
    startRace({ roomCode: host.room.code }, host.playerId, host.room.code),
  );

  assert.ok(activateRace(host.room.code, started.startsAt));

  const reservation = expectSuccess(
    reserveSubmission(
      {
        roomCode: host.room.code,
        explanation: "The async map returns an array of promises.",
        proposedFix: "return Promise.all(ids.map(fetchUser));",
      },
      guest.playerId,
      host.room.code,
      started.startsAt,
    ),
  );

  const semanticEvaluation = await mockSubmissionEvaluator.evaluate(
    reservation.evaluationInput,
  );
  const submission = completeSubmissionEvaluation(
    host.room.code,
    guest.playerId,
    reservation.submissionId,
    semanticEvaluation,
    started.startsAt,
  );

  assert.equal(submission?.evaluation.score.finalScore, 100);

  const finalization = advanceRaceState(host.room.code, started.endsAt);

  assert.ok(finalization);
  assert.ok(finalization.result);
  assert.equal(finalization.result.leaderboard[0]?.username, "Ada");
  assert.equal(finalization.result.leaderboard[0]?.outcome, "SUBMITTED");
  assert.equal(finalization.result.leaderboard[1]?.username, "Zoe");
  assert.equal(finalization.result.leaderboard[1]?.outcome, "TIME_EXPIRED");
  assert.equal(finalization.result.leaderboard[1]?.correct, null);
  assert.equal(finalization.result.leaderboard[1]?.score.finalScore, 0);
  assert.equal(Object.isFrozen(finalization.result), true);
  assert.equal(Object.isFrozen(finalization.result.leaderboard), true);
  assert.deepEqual(finalization.result.settings, started.room.settings);

  const repeated = advanceRaceState(host.room.code, started.endsAt + 1);

  assert.equal(repeated?.result, finalization.result);
  assert.equal(repeated?.didFinish, false);
});

test("invalid, duplicate, and late submissions do not create extra reservations", () => {
  const { host, guest, started } = createActiveRace(
    "Host One",
    "Guest One",
    "reservation",
  );
  const invalid = reserveSubmission(
    { ...validPayload(host.room.code), explanation: "too short" },
    host.playerId,
    host.room.code,
    started.startsAt,
  );

  assert.equal(invalid.ok, false);

  const accepted = reserveSubmission(
    validPayload(host.room.code),
    host.playerId,
    host.room.code,
    started.startsAt,
  );
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.data.status, "EVALUATING");
    assert.equal(accepted.data.acceptedAt, started.startsAt);
  }

  const duplicate = reserveSubmission(
    validPayload(host.room.code),
    host.playerId,
    host.room.code,
    started.startsAt + 1,
  );
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.error.code, "ALREADY_SUBMITTED");
  }

  const late = reserveSubmission(
    validPayload(host.room.code),
    guest.playerId,
    host.room.code,
    started.endsAt,
  );
  assert.equal(late.ok, false);
  if (!late.ok) {
    assert.equal(late.error.code, "RACE_ENDED");
  }
});

test("race stays FINALIZING until every accepted evaluation completes", async () => {
  const { host, guest, started } = createActiveRace(
    "Host Two",
    "Guest Two",
    "pending",
  );
  const hostReservation = expectSuccess(
    reserveSubmission(
      validPayload(host.room.code),
      host.playerId,
      host.room.code,
      started.startsAt,
    ),
  );
  const guestReservation = expectSuccess(
    reserveSubmission(
      validPayload(host.room.code),
      guest.playerId,
      host.room.code,
      started.startsAt + 100,
    ),
  );

  const finalizing = advanceRaceState(host.room.code, started.startsAt + 100);
  assert.equal(finalizing?.room.status, "FINALIZING");
  assert.equal(finalizing?.result, null);

  const hostEvaluation = await mockSubmissionEvaluator.evaluate(
    hostReservation.evaluationInput,
  );
  completeSubmissionEvaluation(
    host.room.code,
    host.playerId,
    hostReservation.submissionId,
    hostEvaluation,
    started.endsAt + 5_000,
  );

  const stillFinalizing = advanceRaceState(
    host.room.code,
    started.endsAt + 5_000,
  );
  assert.equal(stillFinalizing?.room.status, "FINALIZING");
  assert.equal(stillFinalizing?.result, null);

  const guestEvaluation = await mockSubmissionEvaluator.evaluate(
    guestReservation.evaluationInput,
  );
  const guestCompletion = completeSubmissionEvaluation(
    host.room.code,
    guest.playerId,
    guestReservation.submissionId,
    guestEvaluation,
    started.endsAt + 10_000,
  );

  assert.equal(guestCompletion?.evaluation.score.speedScore, 10);

  const finished = advanceRaceState(host.room.code, started.endsAt + 10_000);
  assert.equal(finished?.room.status, "FINISHED");
  assert.ok(finished?.result);
});

test("non-retryable evaluation failure becomes terminal and cannot deadlock results", () => {
  const { host, guest, started } = createActiveRace(
    "Failure Host",
    "Failure Guest",
    "evaluation-failure",
  );
  const hostReservation = expectSuccess(
    reserveSubmission(
      validPayload(host.room.code),
      host.playerId,
      host.room.code,
      started.startsAt,
    ),
  );
  const guestReservation = expectSuccess(
    reserveSubmission(
      validPayload(host.room.code),
      guest.playerId,
      host.room.code,
      started.startsAt + 100,
    ),
  );

  const finalizing = advanceRaceState(host.room.code, started.startsAt + 100);
  assert.equal(finalizing?.room.status, "FINALIZING");

  const hostCompletion = completeSubmissionEvaluation(
    host.room.code,
    host.playerId,
    hostReservation.submissionId,
    semanticEvaluation(35, 35, 20),
    started.startsAt + 200,
  );
  assert.ok(hostCompletion);

  const failure = failSubmissionEvaluation(
    host.room.code,
    guest.playerId,
    guestReservation.submissionId,
    started.startsAt + 300,
  );

  assert.equal(failure?.retryAllowed, false);
  assert.equal(
    failure?.room.players.find((player) => player.id === guest.playerId)
      ?.status,
    "SUBMITTED",
  );

  const finished = advanceRaceState(host.room.code, started.startsAt + 300);
  const failedEntry = finished?.result?.leaderboard.find(
    (entry) => entry.playerId === guest.playerId,
  );

  assert.equal(finished?.room.status, "FINISHED");
  assert.equal(failedEntry?.outcome, "EVALUATION_FAILED");
  assert.equal(failedEntry?.correct, null);
  assert.equal(failedEntry?.score.finalScore, 0);
  assert.equal(failedEntry?.evaluation, null);
});

test("race:finished is emitted once across repeated advancement", async () => {
  const { host, guest, started } = createActiveRace(
    "Host Three",
    "Guest Three",
    "emission",
  );
  const reservations = [
    {
      playerId: host.playerId,
      reservation: expectSuccess(
        reserveSubmission(
          validPayload(host.room.code),
          host.playerId,
          host.room.code,
          started.startsAt,
        ),
      ),
    },
    {
      playerId: guest.playerId,
      reservation: expectSuccess(
        reserveSubmission(
          validPayload(host.room.code),
          guest.playerId,
          host.room.code,
          started.startsAt,
        ),
      ),
    },
  ];

  for (const { playerId, reservation } of reservations) {
    const evaluation = await mockSubmissionEvaluator.evaluate(
      reservation.evaluationInput,
    );
    completeSubmissionEvaluation(
      host.room.code,
      playerId,
      reservation.submissionId,
      evaluation,
      started.startsAt,
    );
  }

  const emittedEvents: string[] = [];
  const io = {
    to() {
      return {
        emit(event: string) {
          emittedEvents.push(event);
        },
      };
    },
  } as unknown as BugRaceServer;

  advanceRace(io, host.room.code, started.startsAt + 1);
  advanceRace(io, host.room.code, started.startsAt + 2);

  assert.equal(
    emittedEvents.filter((event) => event === "race:finished").length,
    1,
  );
});

test("leaderboard ordering is deterministic across score and time ties", () => {
  const host = expectSuccess(
    createRoom({ username: "Zed" }, "ranking-host", false),
  );
  const players = [
    host,
    ...["Yara", "Ada", "Bea", "Cal", "Dan"].map((username, index) =>
      expectSuccess(
        joinRoom(
          { username, roomCode: host.room.code },
          `ranking-${index}`,
          false,
        ),
      ),
    ),
  ];
  const started = expectReadyStart(
    startRace({ roomCode: host.room.code }, host.playerId, host.room.code),
  );
  assert.ok(activateRace(host.room.code, started.startsAt));

  const evaluations = [
    semanticEvaluation(35, 35, 20),
    semanticEvaluation(35, 35, 15),
    semanticEvaluation(35, 20, 20),
    semanticEvaluation(35, 20, 20),
    semanticEvaluation(20, 20, 20),
    semanticEvaluation(20, 20, 20),
  ];
  const acceptanceOffsets = [500, 100, 100, 200, 50, 50];

  players.forEach((player, index) => {
    const reservation = expectSuccess(
      reserveSubmission(
        validPayload(host.room.code),
        player.playerId,
        host.room.code,
        started.startsAt + (acceptanceOffsets[index] ?? 0),
      ),
    );
    completeSubmissionEvaluation(
      host.room.code,
      player.playerId,
      reservation.submissionId,
      evaluations[index]!,
      started.startsAt + 1_000,
    );
  });

  const finished = advanceRaceState(host.room.code, started.startsAt + 1_000);
  assert.deepEqual(
    finished?.result?.leaderboard.map((entry) => entry.username),
    ["Zed", "Yara", "Ada", "Bea", "Cal", "Dan"],
  );
});
