import { NextRequest, NextResponse } from "next/server";
import { executeWalletWithdrawal } from "@/server/yellow";
import { gameStore } from "@/server/game-store";
import { getAddress } from "viem";

/**
 * POST /api/yellow/withdraw-to-wallet/execute
 * 
 * Execute a wallet withdrawal by closing the personal channel and withdrawing to on-chain wallet.
 * This is the final step after user signs the close message.
 * 
 * Request body:
 * {
 *   actionId: string,
 *   wallet: string,
 *   sessionKey: string,
 *   signature: string
 * }
 * 
 * Response:
 * {
 *   channelId: string,
 *   amount: string,
 *   closeTxHash: string,
 *   withdrawalTxHash: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actionId, wallet, sessionKey, signature } = body;

    if (!actionId || !wallet || !sessionKey || !signature) {
      return NextResponse.json(
        { error: "Missing required fields: actionId, wallet, sessionKey, signature" },
        { status: 400 }
      );
    }

    // Get JWT token from game store (set during participant auth)
    const auth = gameStore.getParticipantSessionAuth(getAddress(wallet));
    if (!auth || !auth.jwtToken) {
      return NextResponse.json(
        { error: "Authentication required. Please join the lobby first to authenticate your session." },
        { status: 401 }
      );
    }

    const result = await executeWalletWithdrawal({
      actionId,
      wallet,
      sessionKey,
      signature: signature as `0x${string}`,
      authJwtToken: auth.jwtToken,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API] /api/yellow/withdraw-to-wallet/execute error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute wallet withdrawal" },
      { status: 500 }
    );
  }
}
