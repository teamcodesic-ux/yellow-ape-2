"use client";

import type { LobbyPlayer } from "@/types/game";

interface RoundResultPanelProps {
  crashMultiplier: number | null;
  winners: `0x${string}`[];
  roundPlayers: LobbyPlayer[];
  settlementTxHashes: `0x${string}`[];
}

export default function RoundResultPanel({
  crashMultiplier,
  winners,
  roundPlayers,
  settlementTxHashes,
}: RoundResultPanelProps) {
  if (crashMultiplier == null || (crashMultiplier === null && winners.length === 0)) {
    return null;
  }

  const totalBet = roundPlayers.reduce((sum, p) => sum + Number(p.betAmount), 0);
  const loserPool = roundPlayers
    .filter((p) => !winners.some((w) => w.toLowerCase() === p.wallet.toLowerCase()))
    .reduce((sum, p) => sum + Number(p.betAmount), 0);

  // Compute payout per winner: their bet back + share of loser pool proportional to bet
  const winnerDetails = winners.map((wallet) => {
    const player = roundPlayers.find((p) => p.wallet.toLowerCase() === wallet.toLowerCase());
    const bet = player ? Number(player.betAmount) : 0;
    const totalWinnerBets = roundPlayers
      .filter((p) => winners.some((w) => w.toLowerCase() === p.wallet.toLowerCase()))
      .reduce((sum, p) => sum + Number(p.betAmount), 0);
    const share = totalWinnerBets > 0 ? (bet / totalWinnerBets) * loserPool : 0;
    const payout = bet + share;
    return { wallet, bet, profit: share, payout };
  });

  const hasWinners = winners.length > 0;
  const hasLosers = roundPlayers.length > winners.length;

  return (
    <div className="glass-subtle rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🏆</span>
        <h3 className="text-sm font-bold text-white">Round Result</h3>
      </div>
      
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[#9ca3af]">Crash Point:</span>
          <span className="font-semibold text-[#ef4444] text-sm">
            {crashMultiplier?.toFixed(2)}x
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-[#9ca3af]">Total Pool:</span>
          <span className="font-semibold text-[#fbbf24]">${totalBet.toFixed(2)}</span>
        </div>

        {/* Winners with payouts */}
        {hasWinners ? (
          <div className="mt-3 rounded-lg bg-green-500/10 border border-green-500/20 p-3">
            <div className="text-[10px] text-green-400 uppercase tracking-wider font-semibold mb-2">
              🎉 Winners ({winners.length})
            </div>
            {winnerDetails.map(({ wallet, bet, profit, payout }) => (
              <div key={wallet} className="py-1.5 border-b border-white/5 last:border-b-0">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-white">
                    {wallet.slice(0, 6)}...{wallet.slice(-4)}
                  </span>
                  <span className="font-semibold text-green-400 text-xs">
                    +${profit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-[10px] text-[#9ca3af]">
                    Bet: ${bet.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-green-300">
                    Credited: ${payout.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <div className="text-xs text-red-400 text-center font-semibold">No winners this round</div>
          </div>
        )}

        {/* Losers */}
        {hasLosers && (
          <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <div className="text-[10px] text-red-400 uppercase tracking-wider font-semibold mb-2">
              Losers ({roundPlayers.length - winners.length})
            </div>
            {roundPlayers
              .filter((p) => !winners.some((w) => w.toLowerCase() === p.wallet.toLowerCase()))
              .map((player) => (
                <div key={player.wallet} className="flex items-center justify-between py-1">
                  <span className="font-mono text-xs text-[#9ca3af]">
                    {player.wallet.slice(0, 6)}...{player.wallet.slice(-4)}
                  </span>
                  <span className="font-semibold text-red-400 text-xs">
                    -${Number(player.betAmount).toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Settlement TXs */}
        {settlementTxHashes.length > 0 && (
          <div className="mt-3 rounded-lg bg-black/30 border border-white/5 p-2">
            <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider mb-1">
              Settlement TXs
            </div>
            {settlementTxHashes.map((txHash) => (
              <div key={txHash} className="font-mono text-[10px] text-[#a78bfa] truncate">
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
