import { NextResponse } from "next/server";
import { gameStore } from "@/server/game-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/game/reset-lobby — Move from "ended" back to "lobby" for the next round. */
export async function POST() {
  try {
    const state = gameStore.resetToLobby();
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset to lobby" },
      { status: 400 },
    );
  }
}
