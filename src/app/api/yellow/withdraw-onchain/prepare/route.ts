import { NextResponse } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";
import { gameStore } from "@/server/game-store";
import { prepareUnifiedWithdrawToOnchain } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  allowCreateIfMissing: z.boolean().optional(),
});

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack }
          : error.cause,
    };
  }

  return { value: error };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const wallet = getAddress(payload.wallet);
    const participantAuth = gameStore.getParticipantSessionAuth(wallet);

    if (!participantAuth) {
      return NextResponse.json(
        { error: "Missing session key authorization for this wallet. Join lobby to authorize first." },
        { status: 400 },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (participantAuth.expiresAt <= now) {
      return NextResponse.json(
        { error: "Session key authorization expired. Re-authorize wallet and try again." },
        { status: 400 },
      );
    }
    if (!participantAuth.jwtToken) {
      return NextResponse.json(
        { error: "Participant authentication required. Re-authorize wallet and try again." },
        { status: 400 },
      );
    }

    const prepared = await prepareUnifiedWithdrawToOnchain({
      wallet,
      amount: payload.amount,
      authJwtToken: participantAuth.jwtToken,
      allowCreateIfMissing: payload.allowCreateIfMissing,
    });
    return NextResponse.json(prepared);
  } catch (error) {
    console.error("[api/yellow/withdraw-onchain/prepare] failed", {
      ...serializeError(error),
    });

    const message = error instanceof Error ? error.message : "Failed to prepare on-chain withdrawal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
