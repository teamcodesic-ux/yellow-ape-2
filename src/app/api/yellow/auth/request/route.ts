import { NextResponse } from "next/server";
import { z } from "zod";
import { requestParticipantAuthChallenge } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sessionKey: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
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
    const challenge = await requestParticipantAuthChallenge(payload);
    return NextResponse.json(challenge);
  } catch (error) {
    console.error("[api/yellow/auth/request] failed", {
      ...serializeError(error),
    });
    const message = error instanceof Error ? error.message : "Failed to request participant auth challenge";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
