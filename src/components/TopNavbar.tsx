import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { PublicConfig } from "@/types/page";

type TopNavbarProps = {
  networkOk: boolean;
  targetChainId: number;
  config: PublicConfig | null;
  balanceLoading: boolean;
  tokenBalance: string;
  unifiedBalanceLoading: boolean;
  unifiedBalance: string;
  withdrawAmountInput: string;
  onWithdrawAmountChange: (value: string) => void;
  onWithdraw: () => void;
  canWithdrawUnified: boolean;
  submitting: boolean;
  channelBootstrapPending: boolean;
};

export function TopNavbar({
  networkOk,
  targetChainId,
  config,
  balanceLoading,
  tokenBalance,
  unifiedBalanceLoading,
  unifiedBalance,
  withdrawAmountInput,
  onWithdrawAmountChange,
  onWithdraw,
  canWithdrawUnified,
  submitting,
  channelBootstrapPending,
}: TopNavbarProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
          Yellow Crash Test
        </p>
        <p className="text-lg font-semibold">Base Sepolia Multi-Party Session</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-full px-3 py-1 font-semibold ${
            networkOk ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900"
          }`}
        >
          {networkOk ? `Chain ${targetChainId}` : "Wrong network"}
        </span>
        <span className="rounded-full bg-white px-3 py-1 font-medium">
          {config?.tokenSymbol ?? "Token"}: {balanceLoading ? "..." : tokenBalance}
        </span>
        <span className="rounded-full bg-white px-3 py-1 font-medium">
          Yellow Unified: {unifiedBalanceLoading ? "..." : unifiedBalance}
        </span>
        <input
          type="number"
          step="any"
          min="0"
          value={withdrawAmountInput}
          onChange={(event) => onWithdrawAmountChange(event.target.value)}
          placeholder="Withdraw amount"
          className="w-36 rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-900 outline-none ring-0 focus:border-emerald-500"
        />
        <button
          onClick={onWithdraw}
          disabled={!canWithdrawUnified}
          className="rounded-full bg-emerald-500 px-3 py-1 font-semibold text-zinc-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {submitting
            ? "Processing..."
            : channelBootstrapPending
              ? "Withdraw (Channel Ready)"
              : "Withdraw To Onchain"}
        </button>
        <div className="min-w-[250px]">
          <ConnectButton
            chainStatus="full"
            showBalance={false}
            accountStatus="full"
          />
        </div>
      </div>
    </div>
  );
}
