# BugRace AI

BugRace AI is a real-time multiplayer debugging game. The current vertical
slice supports one shared challenge, asynchronous backend semantic evaluation,
a server-owned 100-point score, and deterministic final results.

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
- Backend-only OpenAI Responses API evaluation with Zod Structured Outputs
- Explicit OpenAI and deterministic mock evaluator modes
- Transparent deterministic fallback labelled `MOCK_FALLBACK`
- Immediate submission reservation followed by private async evaluation
- Public `EVALUATING` status without public answer or evaluation data
- Server-calculated 100-point scores and deterministic final leaderboard
- Server-owned absolute race deadlines with one deadline timer per room
- Early completion when every connected player submits
- `FINALIZING` state while accepted evaluations are pending
- Automatic completion, late-submission rejection and zero-point timeout results
- Display-only browser countdown based on the server's absolute timestamps
- Reference solution revealed only after the race finishes

OpenAI is used only to score root-cause, fix and reasoning semantics. Application
code derives correctness, speed, penalties, final score and rank. The Responses
request uses `store: false`, has no tools, and receives no username, socket ID,
room code or other player data. The deterministic mock evaluator checks a small
known set of phrases and is not semantically intelligent.

AI challenge generation, multiple rounds, authentication and persistence are
not implemented. Submitted code is never executed.

Rooms are stored only in server memory, so restarting the backend loses active
rooms. A disconnected guest is removed without reconnection recovery.
Waiting-room host ownership transfers to the earliest
remaining player; after a race starts, a disconnected host is simply removed
and the race state is preserved. A completed submission is retained for the
leaderboard if its player disconnects; an unsubmitted disconnected player is
removed from the completion requirement. A connected player who does not submit
before the server deadline appears as `TIME_EXPIRED` with zero points.

## Scoring

The application owns the complete scoring contract:

- Root cause: 35 points
- Fix: 35 points
- Reasoning: 20 points
- Speed: 10 points, based only on server `acceptedAt`
- Maximum: 100 points
- Correctness requires exactly 35 root-cause and 35 fix points
- Incorrect answers receive no speed points and are capped at 40
- Hints are not implemented, so `hintsUsed` and `hintPenalty` are currently zero

Ranking is deterministic: submitted players precede timeouts, then correct
answers, final score, semantic subtotal, earlier acceptance time, username and
player ID. Timed-out players appear last in alphabetical order.

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

The server example defaults to deterministic local evaluation:

```text
EVALUATOR_MODE=mock
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_TIMEOUT_MS=12000
OPENAI_MAX_RETRIES=1
OPENAI_FALLBACK_MODE=mock
```

For OpenAI evaluation, set `EVALUATOR_MODE=openai` and place a valid key in
`OPENAI_API_KEY` inside `apps/server/.env`. The key is required only in OpenAI
mode and must never use a `NEXT_PUBLIC_` prefix. Timeouts accept 3,000–30,000 ms,
retries accept 0–2, and fallback accepts `mock` or `none`. The SDK client is
created once at startup, and each accepted answer makes at most one primary
model evaluation call.

## Development

Start the frontend and backend from the repository root:

```bash
pnpm dev
```

The frontend runs at `http://localhost:3000` and the backend at
`http://localhost:4000`.

The server defaults to a 120-second active race. For local deadline testing,
set `RACE_DURATION_MS=10000` in `apps/server/.env`; accepted values are 5,000–
600,000 milliseconds. The client cannot set this value.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
pnpm test
EVALUATOR_MODE=mock pnpm --filter @bugrace/server eval:smoke
```

With a valid configured OpenAI credential, run the selected-mode smoke harness
without the override:

```bash
pnpm --filter @bugrace/server eval:smoke
```

It checks six fixed answers, including poor grammar and a prompt-injection
attempt, prints concise scores only, and exits non-zero on mismatch or fallback
when OpenAI mode is selected.

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
3. Submit and confirm the acknowledgement quickly shows **Submission accepted**
   and **Evaluating your answer…**.
4. Confirm the second browser shows only the first player's `EVALUATING` status,
   without their answer, feedback or score.
5. Confirm only the submitting browser receives the preliminary score,
   evaluator source, confidence, feedback and concepts.
6. Submit from the second browser.
7. Confirm the room enters `FINALIZING` while evaluation is pending, then both
   rooms become `FINISHED` and show the same leaderboard.
8. Confirm the reference root cause, fix and required concepts appear only in
   the finished results.

For the deadline flow, set `RACE_DURATION_MS=10000`, restart the server, and
start a new two-player race. Submit from only one browser. Confirm the local
countdown reaches **Time expired**, both browsers then receive the same final
leaderboard, the submitted player keeps their score, and the other player is
shown as **Did not submit** with `0 / 100`. Repeat without either player
submitting and confirm both receive timeout results. In both cases, confirm the
reference solution appears only after the server finishes the race.
