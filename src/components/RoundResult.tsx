import type { LobbyPlayer } from "@/types/game";
import { toSafeNumber } from "@/lib/utils";

type RoundResultProps = {
  crashMultiplier: number | null;
  winners: `0x${string}`[];
  players: LobbyPlayer[];
  settlementTxHashes: `0x${string}`[];
};

export function RoundResult({
  crashMultiplier,
  winners,
  players,
  settlementTxHashes,
}: RoundResultProps) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Round Result</h2>
      <div className="mt-3 space-y-2 text-sm">
        <p>
          Crash Multiplier:{" "}
          <span className="font-semibold">{crashMultiplier?.toFixed(2) ?? "-"}x</span>
        </p>
        <p>
          Winners: <span className="font-semibold">{winners.length}</span>
        </p>
        <p>
          Total Bet:{" "}
          <span className="font-semibold">
            {players
              .reduce((sum, player) => sum + toSafeNumber(player.betAmount), 0)
              .toFixed(2)}
          </span>
        </p>
      </div>

      <div className="mt-4 max-h-44 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        {winners.length === 0 ? (
          <p className="text-sm text-zinc-500">No winners yet.</p>
        ) : (
          <ul className="space-y-2 text-xs font-mono text-zinc-700">
            {winners.map((winner) => (
              <li key={winner}>{winner}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-zinc-100 p-3 text-xs text-zinc-600">
        <p className="font-semibold">Settlement TXs</p>
        {settlementTxHashes.length === 0 ? (
          <p>None</p>
        ) : (
          settlementTxHashes.map((txHash) => <p key={txHash}>{txHash}</p>)
        )}
      </div>
    </div>
  );
}
