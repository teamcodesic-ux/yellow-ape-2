"use client";

import type { LobbyPlayer } from "@/types/game";

type AutoStatus = "waiting-players" | "ready" | "signing" | "waiting-signatures" | "active" | "cooldown" | "ended";

const AUTO_STATUS_CONFIG: Record<AutoStatus, { label: string; color: string }> = {
  "waiting-players": { label: "Waiting for players", color: "text-gray-400" },
  ready: { label: "Starting...", color: "text-yellow-400" },
  signing: { label: "Signing...", color: "text-blue-400" },
  "waiting-signatures": { label: "Collecting signatures", color: "text-orange-400" },
  active: { label: "Live", color: "text-green-400" },
  cooldown: { label: "Next round soon", color: "text-purple-400" },
  ended: { label: "Round ended", color: "text-orange-400" },
};

type BetPanelProps = {
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
  autoStatus?: AutoStatus;
};

export default function BetPanel({
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
  autoStatus = "waiting-players",
}: BetPanelProps) {
  const statusInfo = AUTO_STATUS_CONFIG[autoStatus];
  return (
    <div className="flex flex-col glass-subtle rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-lg font-bold text-white">Lobby</h2>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${autoStatus === "active" ? "bg-green-400 animate-pulse" : autoStatus === "signing" || autoStatus === "ready" ? "bg-yellow-400 animate-pulse" : "bg-gray-500"}`} />
          <span className={`text-xs font-semibold ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-[#9ca3af] leading-relaxed">
          Minimum 1 player. Join includes session-key authorization, multiplier (1.01x to 10.00x), and bet amount (&gt; 0).
        </p>

        {/* Input Fields */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#9ca3af] font-medium mb-2 block">
              Multiplier
            </label>
            <input
              type="number"
              step="0.01"
              min="1.01"
              max="10.00"
              value={multiplierInput}
              onChange={(e) => onMultiplierChange(e.target.value)}
              className="input-glow w-full px-3 py-3 rounded-xl text-white text-sm font-mono"
              placeholder="2.00"
              aria-label="Multiplier"
            />
          </div>

          <div>
            <label className="text-xs text-[#9ca3af] font-medium mb-2 block">
              Bet Amount
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={betAmountInput}
              onChange={(e) => onBetAmountChange(e.target.value)}
              className="input-glow w-full px-3 py-3 rounded-xl text-white text-sm font-mono"
              placeholder="1.00"
              aria-label="Bet amount"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onJoin}
            disabled={!canJoin}
            className="flex-1 btn-gradient-gold px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInLobby ? "Update" : "Join Lobby"}
          </button>
          <button
            onClick={onLeave}
            disabled={!canLeave}
            className="glass-subtle px-4 py-3 rounded-xl text-[#ef4444] text-sm font-semibold border border-[#ef4444]/30 hover:bg-[#ef4444]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Leave
          </button>
        </div>

        {/* Players List */}
        <div className="glass-subtle rounded-xl border border-white/10 overflow-hidden">
          <div className="bg-white/5 px-3 py-2 border-b border-white/10">
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
              <div>Wallet</div>
              <div>Multiplier</div>
              <div className="text-right">Bet</div>
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {players.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-[#9ca3af]">
                Lobby is empty
              </div>
            ) : (
              players.map((player) => (
                <div
                  key={player.wallet}
                  className="px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="font-mono text-white truncate" title={player.wallet}>
                      {player.wallet.slice(0, 6)}...{player.wallet.slice(-4)}
                    </div>
                    <div className="font-mono font-semibold text-[#a78bfa]">
                      {Number(player.multiplier).toFixed(2)}x
                    </div>
                    <div className="font-mono font-semibold text-[#fbbf24] text-right">
                      ${Number(player.betAmount).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
