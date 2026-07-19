import assert from "node:assert/strict";
import test from "node:test";

import type { AckResult, RaceStartedPayload } from "@bugrace/shared";

import type { GeneratedChallenge } from "../game/challenge-data.js";
import type { ChallengeGenerator } from "../game/challenge-generator.js";
import type { SubmissionEvaluator } from "../game/evaluator.js";
import { createRoom, joinRoom } from "../game/room-service.js";
import {
  registerSocketHandlers,
  type BugRaceServer,
} from "./register-socket-handlers.js";

type RaceStartHandler = (
  payload: { roomCode: string; generateChallenge?: boolean },
  acknowledge: (response: AckResult<{ accepted: true }>) => void,
) => void;

interface EmittedEvent {
  target: string;
  event: string;
  payload: unknown;
}

function expectSuccess<T>(result: { ok: true; data: T } | { ok: false }): T {
  assert.equal(result.ok, true);
  return (result as { ok: true; data: T }).data;
}

function generatedChallenge(): GeneratedChallenge {
  return {
    public: {
      id: "ai-socket-test",
      title: "Overlapping Balance Updates",
      scenario:
        "Two account adjustments overlap and one completed change disappears.",
      language: "typescript",
      topic: "CONCURRENCY",
      difficulty: "MEDIUM",
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

function setupSocketTest(generator: ChallengeGenerator) {
  const host = expectSuccess(
    createRoom({ username: "Socket Host" }, "socket-handler-host", false),
  );
  expectSuccess(
    joinRoom(
      { username: "Socket Guest", roomCode: host.room.code },
      "socket-handler-guest",
      false,
    ),
  );

  const handlers = new Map<string, (...args: unknown[]) => void>();
  const emitted: EmittedEvent[] = [];
  const socketShape = {
    id: "socket-handler-host",
    data: { playerId: host.playerId, roomCode: host.room.code },
    emit() {},
    on(event: string, handler: (...args: unknown[]) => void) {
      handlers.set(event, handler);
    },
  };
  const io = {
    to(target: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ target, event, payload });
        },
      };
    },
  } as unknown as BugRaceServer;
  const evaluator: SubmissionEvaluator = {
    async evaluate() {
      throw new Error("Submission evaluation is not used in this test.");
    },
  };

  registerSocketHandlers(
    io,
    socketShape as unknown as Parameters<typeof registerSocketHandlers>[1],
    evaluator,
    generator,
  );

  const start = handlers.get("race:start") as RaceStartHandler | undefined;
  assert.ok(start);

  return { emitted, host, start };
}

test("duplicate socket start makes one generation call and one room-wide public broadcast", async () => {
  let generationCalls = 0;
  let resolveGeneration: ((challenge: GeneratedChallenge) => void) | undefined;
  const pendingGeneration = new Promise<GeneratedChallenge>((resolve) => {
    resolveGeneration = resolve;
  });
  const generator: ChallengeGenerator = {
    generate() {
      generationCalls += 1;
      return pendingGeneration;
    },
  };
  const { emitted, host, start } = setupSocketTest(generator);
  const acknowledgements: Array<AckResult<{ accepted: true }>> = [];
  const payload = { roomCode: host.room.code, generateChallenge: true };

  start(payload, (response) => acknowledgements.push(response));
  start(payload, (response) => acknowledgements.push(response));

  assert.equal(generationCalls, 1);
  assert.equal(acknowledgements[0]?.ok, true);
  assert.equal(acknowledgements[1]?.ok, false);

  const challenge = generatedChallenge();
  resolveGeneration?.(challenge);
  await new Promise<void>((resolve) => setImmediate(resolve));

  const raceEvents = emitted.filter((entry) => entry.event === "race:started");
  assert.equal(raceEvents.length, 1);
  assert.equal(raceEvents[0]?.target, host.room.code);

  const started = raceEvents[0]?.payload as RaceStartedPayload;
  assert.deepEqual(started.challenge, challenge.public);
  const publicPayload = JSON.stringify(started);
  assert.equal(publicPayload.includes(challenge.private.rootCause), false);
  assert.equal(publicPayload.includes("acceptedAlternatives"), false);
  assert.equal(publicPayload.includes("invalidFixes"), false);
});

test("generation failure starts curated race and notifies only the host socket", async () => {
  const generator: ChallengeGenerator = {
    async generate() {
      throw new Error("offline");
    },
  };
  const { emitted, host, start } = setupSocketTest(generator);

  start({ roomCode: host.room.code, generateChallenge: true }, () => undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));

  const fallbackEvents = emitted.filter(
    (entry) => entry.event === "race:challenge-fallback",
  );
  const raceEvents = emitted.filter((entry) => entry.event === "race:started");

  assert.equal(fallbackEvents.length, 1);
  assert.equal(fallbackEvents[0]?.target, "socket-handler-host");
  assert.deepEqual(fallbackEvents[0]?.payload, {
    message:
      "Generated challenge was unavailable. A curated challenge was selected.",
  });
  assert.equal(raceEvents.length, 1);
  assert.equal(
    (raceEvents[0]?.payload as RaceStartedPayload).challenge.source,
    "CURATED",
  );
});
