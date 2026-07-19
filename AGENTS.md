# BugRace AI

BugRace AI will become a real-time multiplayer debugging game where
developers race to identify, explain, and fix software bugs.

## Current milestone

The current milestone is the multiplayer room and race-start vertical slice:
guest room creation, joining from a second browser, shared lobby state,
host-only race start, and delivery of one hard-coded challenge to every player.

Do not implement:

- answer submission
- AI evaluation or model calls
- scoring
- hints
- leaderboards
- multiple challenges or rounds
- authentication
- databases
- Redis
- Docker
- deployment configuration

unless explicitly requested.

## Planned architecture

- `apps/web` contains the Next.js frontend.
- `apps/server` contains the Node.js, Express, and Socket.IO backend.
- `packages/shared` contains only contracts genuinely shared by frontend and backend.
- The backend will own authoritative game state.
- The frontend will display state and send user intent.
- Socket.IO event names and payload types must come from the shared package.
- Never expose server secrets to the frontend.
- Never call OpenAI directly from the browser.

## Engineering rules

- Use pnpm only.
- Use strict TypeScript.
- Do not introduce Turborepo, Nx, NestJS, Redis, Prisma, Docker, or authentication.
- Do not add dependencies without an immediate use.
- Do not build abstractions for hypothetical future requirements.
- Make the smallest change that completes the current milestone.
- Preserve working behaviour.
- Do not modify unrelated code.
- Validate environment variables.
- Handle visible connection and failure states.
- Run formatting, linting, type checking, and production builds before declaring completion.
- Report verification that was not actually performed.

## Current acceptance criteria

The room and race-start milestone is complete only when:

- one root command starts the frontend and backend;
- the frontend connects to the Socket.IO backend;
- the frontend displays connection status and socket ID;
- an acknowledged ping event works;
- a guest can create a room and becomes its host;
- a second guest can join by room code;
- both guests see the same automatically updated lobby state;
- only the host can start, and at least two connected players are required;
- both guests receive the same public challenge and server timestamps;
- room status transitions from `WAITING` to `COUNTDOWN` to `ACTIVE`;
- waiting-room disconnects update the lobby and transfer host ownership when needed;
- the health endpoint works;
- linting passes;
- type checking passes;
- production builds pass.
