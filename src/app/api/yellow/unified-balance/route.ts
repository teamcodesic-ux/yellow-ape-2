import { NextResponse } from "next/server";
import { z } from "zod";
import { getUnifiedYellowBalance } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      wallet: url.searchParams.get("wallet") ?? "",
    });

    const balance = await getUnifiedYellowBalance(parsed.wallet);
    return NextResponse.json({ ...balance, error: null });
  } catch (error) {
    console.error("[api/yellow/unified-balance] failed", {
      ...serializeError(error),
      url: request.url,
    });

    return NextResponse.json(
      {
        wallet: null,
        asset: process.env.YELLOW_ASSET_ID ?? "ytest.usd",
        amount: "0",
        error: error instanceof Error ? error.message : "Failed to load unified balance",
      },
      { status: 400 },
    );
  }
}
