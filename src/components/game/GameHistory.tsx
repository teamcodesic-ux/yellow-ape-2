"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/store/gameStore";

function getHistoryColor(value: number): string {
  if (value >= 2.5) return "bg-[#10b981]/20 text-[#34d399] border-[#10b981]/30";
  if (value >= 2.0) return "bg-[#fbbf24]/20 text-[#fcd34d] border-[#fbbf24]/30";
  return "bg-[#ef4444]/20 text-[#f87171] border-[#ef4444]/30";
}

export default function GameHistory() {
  const history = useGameStore((s) => s.history);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [history.length]);

  return (
    <div className="border-t border-white/10 shrink-0">
      <div className="px-4 py-2 flex items-center gap-3">
        <span className="text-xs text-[#9ca3af] font-medium shrink-0">History</span>
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
          style={{ scrollBehavior: "smooth" }}
        >
          {history.map((entry, idx) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, scale: 0.8, x: -20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.3, delay: idx < 3 ? idx * 0.08 : 0 }}
              className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono font-bold border cursor-pointer hover:scale-105 transition-transform ${getHistoryColor(
                entry.crashPoint
              )}`}
              title={`Crashed at ${entry.crashPoint}x`}
            >
              {entry.crashPoint.toFixed(2)}x
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
