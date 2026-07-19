import { createServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@bugrace/shared";
import { Server } from "socket.io";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { registerSocketHandlers } from "./realtime/register-socket-handlers.js";

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: env.WEB_ORIGIN,
    methods: ["GET", "POST"],
  },
});

io.on("connection", registerSocketHandlers);

httpServer.listen(env.PORT, () => {
  console.log(`BugRace server listening on http://localhost:${env.PORT}`);
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received; shutting down`);

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
