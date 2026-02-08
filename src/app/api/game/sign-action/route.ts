import { NextResponse } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";
import { gameStore } from "@/server/game-store";
import {
  executeAndApplyPendingAction,
  isInvalidMessageTimestampError,
  refreshPendingActionAfterTimestampError,
} from "@/server/pending-action";
import { verifySessionSignature } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signActionSchema = z.object({
  actionId: z.string().min(1),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = signActionSchema.parse(body);
    const wallet = getAddress(payload.wallet);
    const action = gameStore.getPendingAction();

    if (!action || action.id !== payload.actionId) {
      return NextResponse.json({ error: "Pending action not found" }, { status: 404 });
    }

    const participantAuth = gameStore.getParticipantSessionAuth(wallet);
    if (!participantAuth) {
      return NextResponse.json(
        { error: "This wallet has no authorized session key. Rejoin and authorize first." },
        { status: 400 },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (participantAuth.expiresAt <= now) {
      return NextResponse.json(
        { error: "Session key authorization expired. Re-authorize this wallet and sign again." },
        { status: 400 },
      );
    }

    const signature = payload.signature as `0x${string}`;
    const signatureValid = await verifySessionSignature({
      sessionKey: participantAuth.sessionKey,
      requestPayload: action.requestPayload,
      signature,
    });

    if (!signatureValid) {
      return NextResponse.json({ error: "Invalid session-key signature for this action payload" }, { status: 400 });
    }

    const updatedAction = gameStore.addPendingSignature(action.id, wallet, signature);
    if (!gameStore.isPendingActionFullySigned(updatedAction)) {
      return NextResponse.json(gameStore.getState());
    }

    try {
      await executeAndApplyPendingAction(updatedAction);
    } catch (error) {
      if (isInvalidMessageTimestampError(error)) {
        await refreshPendingActionAfterTimestampError(updatedAction);
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
    const message = error instanceof Error ? error.message : "Failed to sign pending action";
    const lower = message.toLowerCase();
    const clientError =
      lower.includes("not found") ||
      lower.includes("invalid") ||
      lower.includes("expired") ||
      lower.includes("missing") ||
      lower.includes("required");

    if (!clientError) {
      gameStore.setError(message);
    }

    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 });
  }
}
