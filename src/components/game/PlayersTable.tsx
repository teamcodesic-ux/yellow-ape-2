"use client";

import { motion } from "framer-motion";
import { Users, DollarSign } from "lucide-react";
import { useGameStore } from "@/store/gameStore";

export default function PlayersTable() {
  const { players, phase } = useGameStore();
  const totalPool = players.reduce((sum, p) => sum + p.betAmount, 0);

  return (
    <div className="flex flex-col h-full border-t border-white/10">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
          <Users className="w-3.5 h-3.5" />
          <span className="font-semibold text-white">{players.length}</span> Players
        </div>
        <div className="flex items-center gap-1 text-xs text-[#9ca3af]">
          <DollarSign className="w-3 h-3" />
          <span className="font-mono font-semibold text-white">
            {totalPool.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {players.map((player, idx) => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`flex items-center justify-between px-4 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors group
              ${player.cashedOut ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg">{player.avatar}</span>
              <span className="text-sm text-white font-medium truncate max-w-[100px]">
                {player.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {player.cashedOut && player.cashoutMultiplier && (
                <span className="text-xs font-mono text-[#10b981] font-semibold">
                  {player.cashoutMultiplier.toFixed(2)}x
                </span>
              )}
              <span className="text-sm font-mono text-[#a78bfa] font-semibold">
                ${player.betAmount.toFixed(2)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
