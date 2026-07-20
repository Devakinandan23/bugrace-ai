interface HomeScreenProps {
  actionError: string | null;
  createPending: boolean;
  disabled: boolean;
  joinPending: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onRoomCodeChange: (roomCode: string) => void;
  onUsernameChange: (username: string) => void;
  roomCode: string;
  username: string;
}

export function HomeScreen({
  actionError,
  createPending,
  disabled,
  joinPending,
  onCreateRoom,
  onJoinRoom,
  onRoomCodeChange,
  onUsernameChange,
  roomCode,
  username,
}: HomeScreenProps) {
  return (
    <section className="game-panel mx-auto max-w-3xl p-6 sm:p-9">
      <div className="grid items-center gap-8 md:grid-cols-[1fr_12rem]">
        <div>
          <p className="hero-eyebrow">
            <span aria-hidden="true">⚡</span>
            Multiplayer debugging
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            Find the bug before it gets away.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-slate-400">
            Race developers to identify and fix realistic software bugs.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="mx-auto grid aspect-square w-40 place-items-center rounded-[44%_56%_52%_48%] border-2 border-slate-200 bg-emerald-400 text-7xl rotate-3"
        >
          🐞
        </div>
      </div>

      <div className="mt-9 border-t border-slate-800 pt-7">
        <label className="text-sm font-medium" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          minLength={2}
          maxLength={20}
          required
          placeholder="Ada Debugger"
          className="game-field mt-2 w-full px-4 py-3 outline-none"
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onCreateRoom();
            }}
            className="game-tile p-4"
          >
            <h2 className="text-lg font-semibold">Start a new room</h2>
            <p className="mt-1 text-sm text-slate-500">
              You become the host and share the room code.
            </p>
            <button
              type="submit"
              disabled={disabled}
              className="game-primary mt-5 w-full px-5 py-3"
            >
              {createPending ? "Creating room…" : "Create room"}
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onJoinRoom();
            }}
            className="game-tile p-4"
          >
            <label className="text-lg font-semibold" htmlFor="room-code">
              Join an existing room
            </label>
            <input
              id="room-code"
              value={roomCode}
              onChange={(event) => onRoomCodeChange(event.target.value)}
              maxLength={6}
              required
              placeholder="ABC234"
              className="game-field mt-3 w-full px-4 py-3 font-mono uppercase tracking-[0.18em] outline-none"
            />
            <button
              type="submit"
              disabled={disabled}
              className="game-secondary mt-4 w-full px-5 py-3"
            >
              {joinPending ? "Joining room…" : "Join room"}
            </button>
          </form>
        </div>

        {actionError ? (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-rose-900 bg-rose-950 px-4 py-3 text-sm text-rose-300"
          >
            {actionError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
