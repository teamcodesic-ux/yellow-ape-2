import { NextRequest, NextResponse } from "next/server";
import { prepareWalletWithdrawal } from "@/server/yellow";
import { gameStore } from "@/server/game-store";
import { getAddress } from "viem";

/**
 * POST /api/yellow/withdraw-to-wallet/prepare
 * 
 * Prepare a withdrawal from user's personal wallet channel to their on-chain wallet.
 * This is separate from the game's multi-user app sessions.
 * 
 * Request body:
 * {
 *   wallet: string,
 *   sessionKey: string,
 *   amount: string
 * }
 * 
 * Response:
 * {
 *   actionId: string,
 *   channelId: string,
 *   amount: string,
 *   amountBaseUnits: string,
 *   tokenAddress: string,
 *   closeRequestPayload: RequestPayload
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, sessionKey, amount } = body;

    if (!wallet || !sessionKey || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: wallet, sessionKey, amount" },
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

    const result = await prepareWalletWithdrawal({
      wallet,
      sessionKey,
      amount,
      authJwtToken: auth.jwtToken,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API] /api/yellow/withdraw-to-wallet/prepare error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to prepare wallet withdrawal" },
      { status: 500 }
    );
  }
}
