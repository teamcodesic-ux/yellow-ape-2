import type { PendingActionInternal } from "@/server/game-store";
import { gameStore } from "@/server/game-store";
import {
  buildClosePendingAction,
  buildStartPendingAction,
  executePendingAction,
} from "@/server/yellow";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

export function isInvalidMessageTimestampError(error: unknown): boolean {
  return extractErrorMessage(error).toLowerCase().includes("invalid message timestamp");
}

export async function executeAndApplyPendingAction(action: PendingActionInternal): Promise<void> {
  const execution = await executePendingAction(action);

  if (execution.type === "start") {
    if (action.meta.type !== "start") {
      throw new Error("Pending action metadata mismatch for start");
    }

    gameStore.startRound({
      yellowSessionId: execution.appSessionId,
      crashMultiplier: action.meta.crashMultiplier,
      winners: action.meta.winners,
      tokenAddress: execution.tokenAddress,
    });
    gameStore.clearPendingAction();
    gameStore.clearError();
    return;
  }

  if (action.meta.type !== "close") {
    throw new Error("Pending action metadata mismatch for close");
  }

  gameStore.finishRound({
    settlementTxHashes: execution.settlementTxHashes,
  });
  gameStore.clearPendingAction();

  if (execution.settlementError) {
    gameStore.setError(execution.settlementError);
    return;
  }

  gameStore.clearError();
}

export async function refreshPendingActionAfterTimestampError(
  action: PendingActionInternal,
): Promise<PendingActionInternal> {
  const latest = gameStore.getPendingAction();
  if (!latest || latest.id !== action.id) {
    throw new Error("Pending action changed while refreshing timestamp");
  }

  const refreshed =
    action.meta.type === "start"
      ? await buildStartPendingAction({
          players: action.meta.players,
          winners: action.meta.winners,
          crashMultiplier: action.meta.crashMultiplier,
        })
      : await buildClosePendingAction({
          appSessionId: action.meta.appSessionId,
          players: action.meta.players,
          winners: action.meta.winners,
          crashMultiplier: action.meta.crashMultiplier,
          tokenAddress: action.meta.tokenAddress,
        });

  gameStore.clearPendingAction();
  gameStore.setPendingAction(refreshed);
  gameStore.setError(
    "Pending action expired on Yellow due timestamp window. Please collect signatures again.",
  );
  return refreshed;
}
