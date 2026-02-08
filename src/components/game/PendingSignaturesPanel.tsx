"use client";

import type { PendingActionDetails } from "@/types/page";

interface PendingSignaturesPanelProps {
  pendingActionData: PendingActionDetails | null;
  submitting: boolean;
  onFinalize: () => void;
}

export default function PendingSignaturesPanel({
  pendingActionData,
  submitting,
  onFinalize,
}: PendingSignaturesPanelProps) {
  if (!pendingActionData) {
    return null;
  }

  const allSigned = pendingActionData.signedWallets.length === pendingActionData.requiredWallets.length;
  const missingWallets = pendingActionData.requiredWallets.filter(
    wallet => !pendingActionData.signedWallets.includes(wallet)
  );

  return (
    <div className="glass-subtle rounded-xl border border-white/10 p-4">
      <h3 className="text-sm font-bold text-white mb-3">Pending Signatures</h3>
      
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[#9ca3af]">Action:</span>
          <span className="font-semibold text-[#a78bfa] uppercase">{pendingActionData.type}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-[#9ca3af]">Progress:</span>
          <span className="font-semibold text-white">
            {pendingActionData.signedWallets.length} / {pendingActionData.requiredWallets.length}
          </span>
        </div>

        {!allSigned && missingWallets.length > 0 && (
          <div className="mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-xs text-yellow-400 font-semibold mb-1">Waiting for signatures from:</p>
            {missingWallets.map((wallet) => (
              <p key={wallet} className="text-xs font-mono text-yellow-300">
                {wallet.slice(0, 10)}...{wallet.slice(-8)}
              </p>
            ))}
          </div>
        )}

        {/* Signatures List */}
        <div className="mt-3 rounded-lg bg-black/30 border border-white/5 p-2 max-h-28 overflow-y-auto">
          {pendingActionData.requiredWallets.map((wallet) => {
            const signed = pendingActionData.signedWallets.includes(wallet);
            return (
              <div key={wallet} className="flex items-center gap-2 py-1">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${signed ? "bg-green-400" : "bg-gray-500"}`} />
                <span className="font-mono text-xs text-[#9ca3af] truncate">
                  {wallet.slice(0, 6)}...{wallet.slice(-4)}
                </span>
              </div>
            );
          })}
        </div>

        {allSigned && (
          <button
            onClick={onFinalize}
            disabled={submitting}
            className="w-full mt-3 px-3 py-2 rounded-lg text-xs font-semibold text-white
                       bg-gradient-to-r from-green-600 to-green-500
                       hover:from-green-500 hover:to-green-400
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200"
          >
            {submitting ? "Finalizing..." : "Finalize Action"}
          </button>
        )}
      </div>
    </div>
  );
}
