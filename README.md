# BugRace AI

BugRace AI is intended to become a real-time multiplayer debugging game. The
current vertical slice supports creating a room, starting one shared challenge,
submitting an answer, deterministic backend evaluation and final results.

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
- One private explanation and proposed-fix submission per player
- Deterministic backend-only mock evaluation and application-calculated scoring
- Public submission statuses and a final deterministic leaderboard
- Reference solution revealed only after every connected player submits

OpenAI evaluation, multiple rounds, authentication and persistence are not
implemented. Submitted code is never executed; the temporary evaluator checks
for a small deterministic set of phrases and is not semantically intelligent.

Rooms are stored only in server memory. A disconnected guest is removed without
reconnection recovery. Waiting-room host ownership transfers to the earliest
remaining player; after a race starts, a disconnected host is simply removed
and the race state is preserved. A completed submission is retained for the
leaderboard if its player disconnects; an unsubmitted disconnected player is
removed from the completion requirement. If a player remains connected without
submitting, the race does not automatically finish at the deadline in this
milestone. Deadline-driven completion is the next vertical slice.

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

For the submission flow:

1. Wait for the room status to become `ACTIVE` in both browsers.
2. In the first browser, explain that the async `map` returns an array of
   promises and propose `Promise.all` as the fix.
3. Submit and confirm the browser shows **Submission accepted** and its private
   preliminary score.
4. Confirm the second browser shows only the first player's `SUBMITTED` status,
   without their answer, feedback or score.
5. Submit from the second browser.
6. Confirm both rooms become `FINISHED` and show the same leaderboard.
7. Confirm the reference root cause, fix and required concepts appear only in
   the finished results.
