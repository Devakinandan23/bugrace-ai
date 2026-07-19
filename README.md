# BugRace AI

BugRace AI is intended to become a real-time multiplayer debugging game. The
current vertical slice supports creating a room, joining from another browser,
starting a race as the host and delivering one shared debugging challenge.

## Currently implemented

- pnpm workspace with web, server and shared-contract packages
- Next.js App Router frontend with Tailwind CSS
- Express and Socket.IO on one Node.js HTTP server
- Visible connection state, socket ID and acknowledged ping result
- Zod-validated server environment configuration
- Health endpoint and graceful server shutdown
- Guest room creation and joining with a six-character room code
- Server-authoritative lobby state, host ownership and disconnect cleanup
- Host-only race start with shared server timestamps and one public challenge

Answer submission, scoring, AI evaluation, multiple rounds, authentication and
persistence are not implemented.

Rooms are stored only in server memory. A disconnected guest is removed without
reconnection recovery. Waiting-room host ownership transfers to the earliest
remaining player; after a race starts, a disconnected host is simply removed
and the race state is preserved. The provided `endsAt` timestamp is reserved for
the next slice—automatic race completion is intentionally not implemented yet.

## Prerequisites

- Node.js 20.9 or newer
- pnpm 10.33.0

## Setup

Copy the environment examples:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

Install dependencies:

```bash
pnpm install
```

## Development

Start the frontend and backend from the repository root:

```bash
pnpm dev
```

The frontend runs at `http://localhost:3000` and the backend at
`http://localhost:4000`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Repository structure

```text
apps/
  web/       Next.js frontend and singleton Socket.IO client
  server/    Express, HTTP, Socket.IO and in-memory room state
packages/
  shared/    Public browser/server real-time protocol contracts
```

## Manual verification

1. Copy both `.env.example` files to their local equivalents (`.env` for the
   server and `.env.local` for the web app).
2. Run `pnpm install`.
3. Run `pnpm dev` from the repository root.
4. Open `http://localhost:3000`.
5. Confirm the page reports `Connected`.
6. Confirm a socket ID appears.
7. Click **Test connection**.
8. Confirm an acknowledged response appears.
9. Open a second browser or incognito window.
10. Confirm both browser sessions connect independently and show distinct
    socket IDs.
11. Open `http://localhost:4000/health`.
12. Confirm the endpoint returns `{"status":"ok","service":"bugrace-server"}`.

To verify the multiplayer slice, create a room in one browser and join it from a
second browser using a different username. Confirm both player lists update,
that only the host can start, and that both browsers receive challenge
`async-map-001` with identical start and end timestamps.
