import type { PublicConfig, PendingActionDetails } from "@/types/page";
import type { StateResponse } from "@/types/page";

type SessionControlsProps = {
  config: PublicConfig | null;
  state: StateResponse;
  canStartSession: boolean;
  startSessionLabel: string;
  startSessionDisabledReason: string | null;
  canSignPending: boolean;
  submitting: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onSignPendingAction: () => void;
};

export function SessionControls({
  config,
  state,
  canStartSession,
  startSessionLabel,
  startSessionDisabledReason,
  canSignPending,
  submitting,
  onStartSession,
  onEndSession,
  onSignPendingAction,
}: SessionControlsProps) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Session Controls</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Admin creates close/start actions, then every participant signs before submit.
      </p>

      <div className="mt-4 space-y-3">
        <button
          onClick={onStartSession}
          disabled={!canStartSession}
          className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {startSessionLabel}
        </button>
        {!canStartSession ? (
          <p className="text-xs text-zinc-500">{startSessionDisabledReason}</p>
        ) : null}
        <button
          onClick={onEndSession}
          disabled={state.status !== "active" || !!state.pendingAction || submitting}
          className="w-full rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          End Session
        </button>
        <button
          onClick={onSignPendingAction}
          disabled={!canSignPending || submitting}
          className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          Sign Pending Action
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-zinc-100 p-3 text-xs text-zinc-600">
        <p>Yellow Asset: {config?.assetId ?? "ytest.usd"}</p>
        <p>Token Address: {config?.tokenAddress ?? "Unavailable"}</p>
        <p>Admin Wallet: {config?.adminWallet ?? "Unavailable"}</p>
        <p>Session ID: {state.yellowSessionId ?? "None"}</p>
      </div>
    </div>
  );
}
