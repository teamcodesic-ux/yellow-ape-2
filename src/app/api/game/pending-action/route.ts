import { NextResponse } from "next/server";
import { gameStore } from "@/server/game-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const action = gameStore.getPendingAction();

  if (!action) {
    return NextResponse.json({ pendingAction: null });
  }

  const signedWallets = Object.keys(action.signaturesByWallet).map((wallet) => wallet as `0x${string}`);

  return NextResponse.json({
    pendingAction: {
      id: action.id,
      type: action.type,
      method: action.method,
      requestPayload: action.requestPayload,
      requiredWallets: action.requiredWallets,
      signedWallets,
      missingWallets: action.requiredWallets.filter((wallet) => !signedWallets.includes(wallet)),
      createdAt: action.createdAt,
    },
  });
}
