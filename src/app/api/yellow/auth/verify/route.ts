import { NextResponse } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";
import { gameStore } from "@/server/game-store";
import { verifyParticipantAuthSignature } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  authToken: z.string().min(1).optional(),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sessionKey: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  challenge: z.string().min(1),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  expiresAt: z.number().int().positive().optional(),
  scope: z.string().min(1).optional(),
  appName: z.string().min(1).optional(),
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
    const verified = await verifyParticipantAuthSignature({
      authToken: payload.authToken,
      wallet: payload.wallet,
      sessionKey: payload.sessionKey,
      challenge: payload.challenge,
      signature: payload.signature as `0x${string}`,
      expiresAt: payload.expiresAt,
      scope: payload.scope,
      appName: payload.appName,
    });

    gameStore.setParticipantSessionAuth({
      wallet: getAddress(payload.wallet),
      sessionKey: getAddress(payload.sessionKey),
      jwtToken: verified.jwtToken,
      expiresAt: verified.expiresAt,
      scope: verified.scope,
      appName: verified.appName,
      authenticatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/yellow/auth/verify] failed", {
      ...serializeError(error),
    });
    const message = error instanceof Error ? error.message : "Failed to verify participant auth signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
