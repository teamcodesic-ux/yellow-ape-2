import { NextResponse } from "next/server";
import { gameStore } from "@/server/game-store";
import { buildClosePendingAction } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const current = gameStore.getState();

  if (current.pendingAction) {
    return NextResponse.json({ error: "A session action is already waiting for signatures" }, { status: 400 });
  }

  if (current.status !== "active" || !current.yellowSessionId || current.crashMultiplier === null) {
    return NextResponse.json({ error: "No active session to close" }, { status: 400 });
  }

  if (!current.tokenAddress) {
    return NextResponse.json({ error: "Missing token mapping for active session" }, { status: 400 });
  }

  try {
    const roundPlayers = gameStore.getRoundPlayers();
    const action = await buildClosePendingAction({
      appSessionId: current.yellowSessionId,
      players: roundPlayers,
      winners: current.winners,
      crashMultiplier: current.crashMultiplier,
      tokenAddress: current.tokenAddress,
    });

    gameStore.setPendingAction(action);
    return NextResponse.json(gameStore.getState());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare close session action";
    gameStore.setError(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
