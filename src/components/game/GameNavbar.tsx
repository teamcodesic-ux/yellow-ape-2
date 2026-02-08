"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { PublicConfig } from "@/types/page";

interface GameNavbarProps {
  networkOk: boolean;
  targetChainId: number;
  config: PublicConfig | null;
  tokenBalance: string;
  balanceLoading: boolean;
  unifiedBalance: string;
  unifiedBalanceLoading: boolean;
}

export default function GameNavbar({
  networkOk,
  targetChainId,
  config,
  tokenBalance,
  balanceLoading,
  unifiedBalance,
  unifiedBalanceLoading,
}: GameNavbarProps) {
  const chainName = targetChainId === 84532 ? "Base Sepolia" : `Chain ${targetChainId}`;
  const tokenSymbol = config?.tokenSymbol || "TOKEN";

  return (
    <nav
      className="h-20 border-b border-white/10 flex items-center justify-between px-9 shrink-0"
      style={{ background: "rgba(10, 14, 39, 0.9)" }}
    >
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2" aria-label="CrashX Home">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] flex items-center justify-center">
            <Rocket className="w-4 h-4 text-white" />
          </div>
          <span className="text-3xl font-bold text-white hidden sm:block">
            Crash<span className="text-[#a78bfa]">X</span>
          </span>
        </Link>
      </div>

      {/* Balance Display */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-purple-300/70">Chain:</span>
          <span className={`text-sm font-medium ${networkOk ? "text-green-400" : "text-orange-400"}`}>
            {chainName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-purple-300/70">{tokenSymbol}:</span>
          <span className="text-sm font-medium text-white">
            {balanceLoading ? "..." : tokenBalance}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-purple-300/70">Yellow:</span>
          <span className="text-sm font-medium text-purple-300">
            {unifiedBalanceLoading ? "..." : unifiedBalance}
          </span>
        </div>
      </div>

      <div className="min-w-[250px]">
        <ConnectButton
          chainStatus="full"
          showBalance={false}
          accountStatus="full"
        />
      </div>
    </nav>
  );
}
