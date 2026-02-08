import { NextResponse } from "next/server";
import { z } from "zod";
import { gameStore } from "@/server/game-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const leaveSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = leaveSchema.parse(body);

    // Clear a stale start pending action so the player can leave
    const existing = gameStore.getPendingAction();
    if (existing && existing.type === "start") {
      gameStore.clearPendingAction();
    }

    const state = gameStore.removePlayer(payload.wallet);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to leave lobby";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
