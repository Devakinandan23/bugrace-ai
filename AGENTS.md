# BugRace AI

BugRace AI will become a real-time multiplayer debugging game where
developers race to identify, explain, and fix software bugs.

## Current milestone

The current milestone is optional validated AI challenge generation followed by
end-to-end 100-point scoring and final results with asynchronous OpenAI or
deterministic mock semantic evaluation.

Do not implement:

- submitted-code execution
- hints
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
- AI challenge generation is host-requested, backend-only and disabled by
  default.
- A generated challenge is stored once per room; only its public fields may be
  sent before results.
- Invalid or failed generation must fall back to the curated challenge without
  making the race unplayable.
- Player submissions are private.
- Never broadcast one player's explanation or proposed fix to another player.
- Evaluation logic runs only on the backend.
- Final score and ranking are calculated by application code.
- A player may submit only once per race.
- Never execute submitted code.
- The semantic evaluator scores only root cause, fix quality and reasoning.
- Application code alone derives correctness, speed, penalties, final score,
  race outcome and rank.
- OpenAI calls use Structured Outputs, send no player identity, and set
  `store: false`.
- The backend owns the authoritative race deadline.
- Clients may display a countdown but cannot finish a race.
- A server timeout is only a wake-up mechanism; `endsAt` is the source of truth.
- Submissions at or after `endsAt` must be rejected.
- Generated-race state transitions are `WAITING` → `PREPARING` → `COUNTDOWN` →
  `ACTIVE` → `FINALIZING` → `FINISHED`; curated races skip `PREPARING`.
- Accepted submissions become `EVALUATING`; finalization waits for their
  terminal evaluation before creating results.
- Race finalization must be idempotent.
- `race:finished` must be emitted at most once per race.
- Server deadline timers must be cleared when rooms finish or are deleted.

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

The scoring-and-evaluation milestone is complete only when:

- one root command starts the frontend and backend;
- the frontend connects to the Socket.IO backend;
- the frontend displays connection status and socket ID;
- an acknowledged ping event works;
- a guest can create a room and becomes its host;
- a second guest can join by room code;
- both guests see the same automatically updated lobby state;
- only the host can start, and at least two connected players are required;
- an enabled host-only AI generation request reserves `PREPARING` exactly once,
  validates structured output and falls back to the curated challenge on any
  generation failure;
- every player receives the same stored public challenge, while its private
  rubric remains backend-only until final results;
- both guests receive the same public challenge and server timestamps;
- generated room status transitions from `WAITING` to `PREPARING` to
  `COUNTDOWN` to `ACTIVE` to `FINALIZING` to `FINISHED`;
- the server owns absolute `startsAt` and `endsAt` timestamps and one deadline
  timer per active room;
- the browser countdown is display-only and emits no timer events;
- each player can submit one validated explanation and proposed fix;
- rapid duplicate submissions result in one stored submission;
- one startup-selected backend evaluator returns only semantic component scores;
- OpenAI mode uses the Responses API, Structured Outputs and bounded SDK
  timeout/retries; mock mode remains deterministic;
- OpenAI failure uses the configured transparent fallback and never silently
  marks infrastructure failure as an incorrect answer;
- application code calculates correctness, speed, the 100-point final score and
  deterministic ranking;
- other players see only public `SOLVING`, `EVALUATING` or `SUBMITTED` status
  during the race;
- submission acknowledgement confirms reservation before async evaluation
  completes, and evaluation details are sent only to the submitting socket;
- the race enters `FINALIZING` when every connected player reserves an answer
  or the server deadline is reached, then becomes `FINISHED` after accepted
  evaluations complete;
- submissions at or after `endsAt` are rejected;
- connected non-submitters become `TIME_EXPIRED` with zero points;
- race finalization and `race:finished` emission are idempotent;
- deadline timers are cleared on completion, room deletion and shutdown;
- every player receives the same final leaderboard and reference solution;
- submitted answers remain private before and after completion;
- waiting-room disconnects update the lobby and transfer host ownership when needed;
- the health endpoint works;
- linting passes;
- type checking passes;
- production builds pass.
