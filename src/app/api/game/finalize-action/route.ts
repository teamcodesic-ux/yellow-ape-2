import { NextResponse } from "next/server";
import { z } from "zod";
import { gameStore } from "@/server/game-store";
import {
  executeAndApplyPendingAction,
  isInvalidMessageTimestampError,
  refreshPendingActionAfterTimestampError,
} from "@/server/pending-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const finalizeActionSchema = z.object({
  actionId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = finalizeActionSchema.parse(body);
    const action = gameStore.getPendingAction();

    if (!action) {
      return NextResponse.json({ error: "No pending action to finalize" }, { status: 404 });
    }

    if (payload.actionId && payload.actionId !== action.id) {
      return NextResponse.json({ error: "Pending action changed. Refresh and retry." }, { status: 409 });
    }

    if (!gameStore.isPendingActionFullySigned(action)) {
      const signedWallets = Object.keys(action.signaturesByWallet).map((wallet) => wallet as `0x${string}`);
      const missingWallets = action.requiredWallets.filter((wallet) => !signedWallets.includes(wallet));
      return NextResponse.json(
        { error: `Missing signatures: ${missingWallets.join(", ")}` },
        { status: 400 },
      );
    }

    try {
      await executeAndApplyPendingAction(action);
    } catch (error) {
      if (isInvalidMessageTimestampError(error)) {
        await refreshPendingActionAfterTimestampError(action);
        return NextResponse.json(
          {
            error:
              "Pending action expired on Yellow due timestamp window. A fresh action was created; all participants must sign again.",
            state: gameStore.getState(),
          },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json(gameStore.getState());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize pending action";
    gameStore.setError(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
