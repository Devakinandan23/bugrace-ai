import type { FinalRaceResult } from "@bugrace/shared";

import type { BugRaceServer } from "../realtime/register-socket-handlers.js";
import { advanceRaceState, getRaceDeadlineState } from "./room-service.js";

const deadlineTimers = new Map<string, NodeJS.Timeout>();

export function clearRaceDeadline(roomCode: string): void {
  const timeout = deadlineTimers.get(roomCode);

  if (timeout) {
    clearTimeout(timeout);
    deadlineTimers.delete(roomCode);
  }
}

export function clearAllRaceDeadlines(): void {
  for (const timeout of deadlineTimers.values()) {
    clearTimeout(timeout);
  }

  deadlineTimers.clear();
}

export function advanceRace(
  io: BugRaceServer,
  roomCode: string,
  now = Date.now(),
): FinalRaceResult | null {
  const advancement = advanceRaceState(roomCode, now);

  if (!advancement) {
    return null;
  }

  if (advancement.enteredFinalizing || advancement.didFinish) {
    clearRaceDeadline(roomCode);
    io.to(roomCode).emit("room:state", advancement.room);
  }

  if (advancement.didFinish && advancement.result) {
    io.to(roomCode).emit("race:finished", advancement.result);
  }

  return advancement.result;
}

function handleRaceDeadline(io: BugRaceServer, roomCode: string): void {
  deadlineTimers.delete(roomCode);

  const deadlineState = getRaceDeadlineState(roomCode);

  if (
    !deadlineState ||
    deadlineState.status === "FINISHED" ||
    deadlineState.endsAt === undefined
  ) {
    clearRaceDeadline(roomCode);
    return;
  }

  const now = Date.now();
  const remainingMs = deadlineState.endsAt - now;

  if (remainingMs > 0) {
    scheduleRaceDeadline(io, roomCode, deadlineState.endsAt);
    return;
  }

  advanceRace(io, roomCode, now);
}

export function scheduleRaceDeadline(
  io: BugRaceServer,
  roomCode: string,
  endsAt: number,
): void {
  clearRaceDeadline(roomCode);

  const timeout = setTimeout(
    () => handleRaceDeadline(io, roomCode),
    Math.max(0, endsAt - Date.now()),
  );

  timeout.unref();
  deadlineTimers.set(roomCode, timeout);
}
