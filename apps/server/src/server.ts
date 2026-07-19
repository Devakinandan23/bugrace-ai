import { createServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@bugrace/shared";
import { type DefaultEventsMap, Server } from "socket.io";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { createSubmissionEvaluator } from "./game/evaluator-factory.js";
import { clearAllRaceDeadlines } from "./game/race-deadline.js";
import {
  registerSocketHandlers,
  type SocketData,
} from "./realtime/register-socket-handlers.js";

const httpServer = createServer(app);
const evaluator = createSubmissionEvaluator(env);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>(httpServer, {
  cors: {
    origin: env.WEB_ORIGIN,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  registerSocketHandlers(io, socket, evaluator);
});

httpServer.listen(env.PORT, () => {
  console.log(`BugRace server listening on http://localhost:${env.PORT}`);
  console.log(`Submission evaluator mode: ${env.EVALUATOR_MODE}`);
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received; shutting down`);
  clearAllRaceDeadlines();

  const forceShutdown = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 5_000);

  forceShutdown.unref();

  io.close(() => {
    clearTimeout(forceShutdown);
    console.log("Server stopped");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
