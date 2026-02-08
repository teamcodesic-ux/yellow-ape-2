type CashOutBarProps = {
  cashOutAmountInput: string;
  onCashOutAmountChange: (value: string) => void;
  onCashOut: () => void;
  canCashOut: boolean;
  submitting: boolean;
  hasValidCashOutAmount: boolean;
  cashOutAmountWithinBalance: boolean;
};

export function CashOutBar({
  cashOutAmountInput,
  onCashOutAmountChange,
  onCashOut,
  canCashOut,
  submitting,
  hasValidCashOutAmount,
  cashOutAmountWithinBalance,
}: CashOutBarProps) {
  return (
    <div className="border-t border-amber-300 bg-amber-50">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            Cash Out to Wallet
          </span>
          <span className="text-xs text-amber-600">
            (Closes personal channel, withdraws to your on-chain wallet)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            min="0"
            value={cashOutAmountInput}
            onChange={(event) => onCashOutAmountChange(event.target.value)}
            placeholder="Cash-out amount"
            className="w-36 rounded-full border border-amber-300 bg-white px-3 py-1 text-sm font-medium text-zinc-900 outline-none ring-0 focus:border-rose-500"
          />
          <button
            onClick={onCashOut}
            disabled={!canCashOut}
            className="rounded-full bg-rose-500 px-4 py-1 font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {submitting ? "Processing..." : "Cash Out"}
          </button>
          {!canCashOut && cashOutAmountInput && (
            <span className="text-xs text-rose-600">
              {!hasValidCashOutAmount
                ? "Enter valid amount"
                : !cashOutAmountWithinBalance
                  ? "Insufficient balance"
                  : "Connect wallet"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
