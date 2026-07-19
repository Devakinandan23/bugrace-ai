# BugRace AI

BugRace AI is intended to become a real-time multiplayer debugging game. This
milestone implements only the repository foundation and a typed Socket.IO
connection between a Next.js frontend and an Express backend.

## Currently implemented

- pnpm workspace with web, server and shared-contract packages
- Next.js App Router frontend with Tailwind CSS
- Express and Socket.IO on one Node.js HTTP server
- Visible connection state, socket ID and acknowledged ping result
- Zod-validated server environment configuration
- Health endpoint and graceful server shutdown

Rooms, races, challenges, scoring, AI, authentication and persistence are not
implemented.

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
  server/    Express, HTTP and Socket.IO backend
packages/
  shared/    Browser/server real-time protocol contracts
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
