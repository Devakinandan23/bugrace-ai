import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@bugrace/shared";
import type { Socket } from "socket.io";

type BugRaceSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(socket: BugRaceSocket): void {
  console.log(`Socket connected: ${socket.id}`);

  socket.emit("connection:ready", {
    socketId: socket.id,
    connectedAt: new Date().toISOString(),
  });

  socket.on("connection:ping", (_payload, acknowledge) => {
    acknowledge({
      ok: true,
      receivedAt: new Date().toISOString(),
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
}
