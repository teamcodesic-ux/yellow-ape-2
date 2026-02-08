import { NextResponse } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";
import { canStartGame, computeWinners, gameStore, generateCrashMultiplier } from "@/server/game-store";
import { assertPlayersCanCoverLosses, buildStartPendingAction } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const joinSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sessionKey: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  multiplier: z.number(),
  betAmount: z.number(),
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

/**
 * Fire-and-forget: attempt to auto-start a session when enough players are ready.
 * Has a 10s timeout to avoid hanging if Yellow WS is slow.
 * Failures are logged but never bubble up to the caller so the join itself always succeeds.
 */
async function tryAutoStartSession(): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("auto-start timed out")), 10_000),
  );

  try {
    await Promise.race([tryAutoStartSessionInner(), timeout]);
  } catch (error) {
    console.warn("[auto-start] skipped:", error instanceof Error ? error.message : error);
  }
}

async function tryAutoStartSessionInner(): Promise<void> {
  const current = gameStore.getState();

  if (current.status === "active" || current.pendingAction) return;
  if (!canStartGame(current.players)) return;

  const missingAuth = gameStore.getMissingSessionAuth(current.players.map((p) => p.wallet));
  if (missingAuth.length > 0) return;

  await assertPlayersCanCoverLosses(current.players);

  const crashMultiplier = generateCrashMultiplier();
  const winners = computeWinners(current.players, crashMultiplier);
  const action = await buildStartPendingAction({
    players: current.players,
    winners,
    crashMultiplier,
  });

  gameStore.setPendingAction(action);
  console.log("[auto-start] session start action created after join");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = joinSchema.parse(body);
    const normalizedWallet = getAddress(payload.wallet);
    const normalizedSessionKey = getAddress(payload.sessionKey);
    const auth = gameStore.getParticipantSessionAuth(normalizedWallet);

    if (!auth) {
      return NextResponse.json(
        { error: "Session key authorization missing. Authorize this wallet before joining." },
        { status: 400 },
      );
    }

    if (getAddress(auth.sessionKey) !== normalizedSessionKey) {
      return NextResponse.json(
        { error: "Authorized session key does not match this wallet's active session key." },
        { status: 400 },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (auth.expiresAt <= now) {
      return NextResponse.json(
        { error: "Session key authorization expired. Re-authorize this wallet, then join again." },
        { status: 400 },
      );
    }

    // Clear any stale start pending action so the new player is included
    const existing = gameStore.getPendingAction();
    if (existing && existing.type === "start") {
      gameStore.clearPendingAction();
      console.log("[join] Cleared stale start pending action to include new player");
    }

    gameStore.upsertPlayer(payload.wallet, payload.multiplier, payload.betAmount);

    // Fire-and-forget auto-start — never blocks the join response
    tryAutoStartSession().catch(() => {});

    return NextResponse.json(gameStore.getState());
  } catch (error) {
    console.error("[api/game/join] failed", {
      ...serializeError(error),
    });
    const message = error instanceof Error ? error.message : "Failed to join lobby";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
