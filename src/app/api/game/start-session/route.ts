import { NextResponse } from "next/server";
import { canStartGame, computeWinners, gameStore, generateCrashMultiplier } from "@/server/game-store";
import { assertPlayersCanCoverLosses, buildStartPendingAction } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const current = gameStore.getState();

  if (current.pendingAction) {
    return NextResponse.json({ error: "A session action is already waiting for signatures" }, { status: 400 });
  }

  if (current.status === "active") {
    return NextResponse.json({ error: "Session already active" }, { status: 400 });
  }

  if (!canStartGame(current.players)) {
    return NextResponse.json(
      { error: "Need at least 1 player with valid multiplier and bet amount" },
      { status: 400 },
    );
  }

  const missingAuth = gameStore.getMissingSessionAuth(current.players.map((player) => player.wallet));
  if (missingAuth.length > 0) {
    return NextResponse.json(
      {
        error: `Missing session-key authorization for: ${missingAuth.join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    await assertPlayersCanCoverLosses(current.players);

    const crashMultiplier = generateCrashMultiplier();
    const winners = computeWinners(current.players, crashMultiplier);
    const action = await buildStartPendingAction({
      players: current.players,
      winners,
      crashMultiplier,
    });

    gameStore.setPendingAction(action);
    return NextResponse.json(gameStore.getState());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare start session action";
    gameStore.setError(message);
    const status = message.toLowerCase().includes("player funding precheck") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
