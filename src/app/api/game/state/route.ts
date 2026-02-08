import { NextResponse } from "next/server";
import { canStartGame, gameStore } from "@/server/game-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = gameStore.getState();

  return NextResponse.json({
    ...state,
    canStart: state.status !== "active" && !state.pendingAction && canStartGame(state.players),
  });
}
