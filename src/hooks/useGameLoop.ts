"use client";

import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@/store/gameStore";

/**
 * Drives the crash-graph animation.
 *
 * @param targetCrashPoint – the crash multiplier decided by the server.
 *   When it's a positive number the rocket will climb to that value and crash.
 *   When it's `null` the hook stays idle (waiting for the next round).
 *
 * @param active – true while the Yellow Network session status is "active".
 *   The animation starts when `active` flips to true and a valid
 *   `targetCrashPoint` is available.  Once the rocket crashes the graph
 *   stays in the "crashed" phase until the caller resets it.
 */
export default function useGameLoop(
  targetCrashPoint: number | null = null,
  active: boolean = false,
) {
  const {
    phase,
    startRound,
    crashRound,
    resetRound,
    setMultiplier,
    addGraphPoint,
    cashOut,
  } = useGameStore();

  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const crashPointRef = useRef<number>(0);
  /** Prevents re-triggering the animation for the same round */
  const activeRoundRef = useRef<boolean>(false);

  const runGame = useCallback(() => {
    const tick = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = (timestamp - startTimeRef.current) / 1000;

      const mult = Math.pow(Math.E, 0.06 * Math.pow(elapsed, 1.5));
      const rounded = Math.round(mult * 100) / 100;

      if (rounded >= crashPointRef.current) {
        crashRound(crashPointRef.current);
        activeRoundRef.current = false;
        return;
      }

      setMultiplier(rounded);
      addGraphPoint({ time: elapsed, value: rounded });

      const state = useGameStore.getState();
      if (
        state.autoCashout &&
        state.hasBet &&
        !state.hasCashedOut &&
        rounded >= state.autoCashout
      ) {
        cashOut();
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [crashRound, setMultiplier, addGraphPoint, cashOut]);

  // ── Start animation when the session goes active & crash point is known ──
  useEffect(() => {
    if (!active || targetCrashPoint == null || targetCrashPoint <= 0) return;
    if (activeRoundRef.current) return; // already running for this round

    console.log("[useGameLoop] Starting animation → crash at", targetCrashPoint);
    activeRoundRef.current = true;
    crashPointRef.current = targetCrashPoint;
    startTimeRef.current = 0;
    startRound();
    runGame();
  }, [active, targetCrashPoint, startRound, runGame]);

  // ── When the session is no longer active and wasn't crashed yet, reset ──
  useEffect(() => {
    if (!active && phase === "running") {
      cancelAnimationFrame(animFrameRef.current);
      // Session ended externally (e.g. timeout) while animation was still climbing
      if (targetCrashPoint != null && targetCrashPoint > 0) {
        crashRound(targetCrashPoint);
      }
      activeRoundRef.current = false;
    }
  }, [active, phase, targetCrashPoint, crashRound]);

  // ── Reset the graph when a new round is about to start (lobby state) ──
  useEffect(() => {
    if (!active && phase === "crashed") {
      // Give the user a moment to see the crash, then reset for next round
      const timeout = setTimeout(() => {
        resetRound();
        activeRoundRef.current = false;
      }, 4000);
      return () => clearTimeout(timeout);
    }
  }, [active, phase, resetRound]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);
}
