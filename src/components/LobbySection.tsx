import type { LobbyPlayer } from "@/types/game";
import { toSafeNumber } from "@/lib/utils";

type LobbySectionProps = {
  status: string;
  players: LobbyPlayer[];
  multiplierInput: string;
  onMultiplierChange: (value: string) => void;
  betAmountInput: string;
  onBetAmountChange: (value: string) => void;
  canJoin: boolean;
  isInLobby: boolean;
  onJoin: () => void;
  onLeave: () => void;
  canLeave: boolean;
  canStartSession: boolean;
  startSessionDisabledReason: string | null;
  onStartSession: () => void;
};

export function LobbySection({
  status,
  players,
  multiplierInput,
  onMultiplierChange,
  betAmountInput,
  onBetAmountChange,
  canJoin,
  isInLobby,
  onJoin,
  onLeave,
  canLeave,
  canStartSession,
  startSessionDisabledReason,
  onStartSession,
}: LobbySectionProps) {
  return (
    <section className="md:col-span-2">
      <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Lobby</h1>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            Status: {status}
          </span>
        </div>

        <p className="mt-2 text-sm text-zinc-600">
          Minimum 1 player. Join includes session-key authorization, multiplier (1.01x to 10.00x),
          and bet amount (&gt; 0).
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <input
            value={multiplierInput}
            onChange={(event) => onMultiplierChange(event.target.value)}
            placeholder="Enter multiplier (e.g. 2.35)"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none ring-amber-400 transition focus:ring"
          />
          <input
            value={betAmountInput}
            onChange={(event) => onBetAmountChange(event.target.value)}
            placeholder="Enter bet amount (e.g. 5.00)"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none ring-amber-400 transition focus:ring"
          />
          <button
            disabled={!canJoin}
            onClick={onJoin}
            className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isInLobby ? "Update Guess" : "Join Lobby"}
          </button>
          <button
            disabled={!canLeave}
            onClick={onLeave}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            Leave
          </button>
        </div>

        {status === "ended" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-100 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              Round ended. You can start a new session with the current lobby players.
            </p>
            <button
              onClick={onStartSession}
              disabled={!canStartSession}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Start New Session
            </button>
            {!canStartSession ? (
              <p className="text-xs text-amber-800">{startSessionDisabledReason}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Wallet</th>
                <th className="px-4 py-3 font-semibold">Multiplier Guess</th>
                <th className="px-4 py-3 font-semibold">Bet Amount</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                    Lobby is empty
                  </td>
                </tr>
              ) : (
                players.map((player) => (
                  <tr key={player.wallet} className="border-t border-zinc-200">
                    <td className="px-4 py-3 font-mono text-xs md:text-sm">{player.wallet}</td>
                    <td className="px-4 py-3 font-semibold">
                      {toSafeNumber(player.multiplier).toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {toSafeNumber(player.betAmount).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
