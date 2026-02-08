import type { PendingActionDetails } from "@/types/page";

type PendingSignaturesProps = {
  pendingActionData: PendingActionDetails | null;
  submitting: boolean;
  onFinalize: () => void;
};

export function PendingSignatures({
  pendingActionData,
  submitting,
  onFinalize,
}: PendingSignaturesProps) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Pending Signatures</h2>
      {!pendingActionData ? (
        <p className="mt-3 text-sm text-zinc-500">No pending action.</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            Action: <span className="font-semibold uppercase">{pendingActionData.type}</span>
          </p>
          <p>
            Method: <span className="font-semibold">{pendingActionData.method}</span>
          </p>
          <p>
            Signed:{" "}
            <span className="font-semibold">{pendingActionData.signedWallets.length}</span> /{" "}
            <span className="font-semibold">{pendingActionData.requiredWallets.length}</span>
          </p>
          <div className="max-h-28 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs font-mono">
            {pendingActionData.missingWallets.length === 0 ? (
              <p>All signatures collected.</p>
            ) : (
              pendingActionData.missingWallets.map((wallet) => <p key={wallet}>{wallet}</p>)
            )}
          </div>
          {pendingActionData.missingWallets.length === 0 ? (
            <button
              onClick={onFinalize}
              disabled={submitting}
              className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Finalize Pending Action
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
