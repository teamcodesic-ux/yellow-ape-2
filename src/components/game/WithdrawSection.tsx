"use client";

interface WithdrawSectionProps {
  withdrawAmountInput: string;
  setWithdrawAmountInput: (value: string) => void;
  onWithdraw: () => void;
  canWithdraw: boolean;
  submitting: boolean;
  channelBootstrapPending: boolean;
}

export default function WithdrawSection({
  withdrawAmountInput,
  setWithdrawAmountInput,
  onWithdraw,
  canWithdraw,
  submitting,
  channelBootstrapPending,
}: WithdrawSectionProps) {
  const isLoading = submitting || channelBootstrapPending;

  return (
    <div
      className="p-4 mb-4 rounded-xl border border-white/10"
      style={{ background: "rgba(17, 24, 39, 0.3)" }}
    >
      <h3 className="text-sm font-semibold text-purple-300 mb-3">Withdraw to On-Chain</h3>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={withdrawAmountInput}
          onChange={(e) => setWithdrawAmountInput(e.target.value)}
          placeholder="Amount"
          disabled={isLoading}
          className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-gray-500
                     border border-white/10 focus:border-purple-500 focus:outline-none
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "rgba(17, 24, 39, 0.5)" }}
        />
        
        <button
          onClick={onWithdraw}
          disabled={!canWithdraw || isLoading}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white
                     bg-gradient-to-r from-purple-600 to-purple-500
                     hover:from-purple-500 hover:to-purple-400
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200"
        >
          {isLoading ? "..." : "Withdraw"}
        </button>
      </div>
    </div>
  );
}
