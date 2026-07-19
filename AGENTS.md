# BugRace AI

BugRace AI will become a real-time multiplayer debugging game where
developers race to identify, explain, and fix software bugs.

## Current milestone

The current milestone is repository and real-time connection setup only.

Do not implement:

- rooms
- players
- races
- debugging challenges
- AI evaluation
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

The setup milestone is complete only when:

- one root command starts the frontend and backend;
- the frontend connects to the Socket.IO backend;
- the frontend displays connection status and socket ID;
- an acknowledged ping event works;
- two independent browser sessions can connect;
- the health endpoint works;
- linting passes;
- type checking passes;
- production builds pass.
