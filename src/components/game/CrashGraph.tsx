"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/gameStore";

export default function CrashGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { phase, multiplier, crashPoint, graphPoints } = useGameStore();
  
  const [rocketScreenPos, setRocketScreenPos] = useState({ x: 0, y: 0, angle: -45 });
  const [crashPos, setCrashPos] = useState({ x: 0, y: 0 });

  const rocketPos = useMemo(() => {
    if (graphPoints.length < 2) return { x: 0, y: 0, angle: -45 };
    const last = graphPoints[graphPoints.length - 1];
    const prev = graphPoints[Math.max(0, graphPoints.length - 3)];
    
    const dx = last.time - prev.time;
    const dy = last.value - prev.value;
    
    let angle = -Math.atan2(dy, dx) * (180 / Math.PI);
    angle = Math.max(-75, Math.min(-15, angle));
    
    return { x: last.time, y: last.value, angle };
  }, [graphPoints]);

  useEffect(() => {
    if (phase === "crashed" && rocketScreenPos.x !== 0) {
      setCrashPos({ x: rocketScreenPos.x, y: rocketScreenPos.y });
    }
  }, [phase, rocketScreenPos]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padding = { top: 40, right: 75, bottom: 40, left: 20 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    ctx.clearRect(0, 0, W, H);

    if (graphPoints.length < 2) return;

    const maxTime = Math.max(graphPoints[graphPoints.length - 1].time, 5);
    const maxVal = Math.max(multiplier, 2);
    const minVal = 1;

    const scaleX = (t: number) => padding.left + (t / maxTime) * chartW;
    const scaleY = (v: number) =>
      padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;

    const ySteps = 10;
    const yStep = (maxVal - minVal) / ySteps;
    for (let i = 0; i <= ySteps; i++) {
      const val = minVal + i * yStep;
      const y = scaleY(val);
      
      ctx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)";
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "12px 'JetBrains Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${val.toFixed(2)}x`, W - padding.right - 5, y + 4);
      }
    }

    const tSteps = Math.min(Math.ceil(maxTime / 1), 12);
    for (let i = 0; i <= tSteps; i++) {
      const t = (maxTime / tSteps) * i;
      const x = scaleX(t);
      
      ctx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)";
      
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, H - padding.bottom);
      ctx.stroke();

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "11px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${t.toFixed(0)}s`, x, H - padding.bottom + 20);
      }
    }

    const lastPt = graphPoints[graphPoints.length - 1];
    const gradient = ctx.createLinearGradient(0, padding.top, 0, H - padding.bottom);
    if (phase === "crashed") {
      gradient.addColorStop(0, "rgba(239, 68, 68, 0.3)");
      gradient.addColorStop(1, "rgba(239, 68, 68, 0)");
    } else {
      gradient.addColorStop(0, "rgba(124, 58, 237, 0.3)");
      gradient.addColorStop(1, "rgba(124, 58, 237, 0)");
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(scaleX(graphPoints[0].time), scaleY(graphPoints[0].value));
    for (let i = 1; i < graphPoints.length; i++) {
      ctx.lineTo(scaleX(graphPoints[i].time), scaleY(graphPoints[i].value));
    }
    ctx.lineTo(scaleX(lastPt.time), scaleY(minVal));
    ctx.lineTo(scaleX(graphPoints[0].time), scaleY(minVal));
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "transparent";
    ctx.lineWidth = 0;
    ctx.fill();
    ctx.restore();

    const lineGrad = ctx.createLinearGradient(
      scaleX(graphPoints[0].time), 0, scaleX(lastPt.time), 0
    );
    if (phase === "crashed") {
      lineGrad.addColorStop(0, "#ef4444");
      lineGrad.addColorStop(1, "#f87171");
    } else {
      lineGrad.addColorStop(0, "#7c3aed");
      lineGrad.addColorStop(0.5, "#a78bfa");
      lineGrad.addColorStop(1, "#ef4444");
    }

    ctx.beginPath();
    ctx.moveTo(scaleX(graphPoints[0].time), scaleY(graphPoints[0].value));
    for (let i = 1; i < graphPoints.length; i++) {
      ctx.lineTo(scaleX(graphPoints[i].time), scaleY(graphPoints[i].value));
    }
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = phase === "crashed" ? "rgba(239, 68, 68, 0.6)" : "rgba(124, 58, 237, 0.6)";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (phase === "running" && lastPt) {
      const rx = scaleX(lastPt.time);
      const ry = scaleY(lastPt.value);
      
      const topMargin = 140;
      const sideMargin = 60;
      const clampedX = Math.max(padding.left + sideMargin, Math.min(rx, W - padding.right - sideMargin));
      const clampedY = Math.max(padding.top + topMargin, Math.min(ry, H - padding.bottom - sideMargin));
      
      setRocketScreenPos({ x: clampedX, y: clampedY, angle: rocketPos.angle });
    }
  }, [graphPoints, phase, multiplier, rocketPos.angle]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      useGameStore.getState().addGraphPoint({ time: -1, value: -1 });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const multiplierColor =
    phase === "crashed"
      ? "text-[#ef4444]"
      : multiplier >= 2
      ? "text-[#10b981]"
      : "text-white";

  const multiplierGlow =
    phase === "crashed"
      ? "number-glow-red"
      : multiplier >= 2
      ? "number-glow-green"
      : "number-glow";

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[300px] flex items-center justify-center"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="relative z-10 text-center pointer-events-none select-none">
        <AnimatePresence mode="wait">
          {phase === "waiting" ? (
            <motion.div
              key="waiting"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="text-center"
            >
              <div className="text-4xl sm:text-5xl font-black text-[#9ca3af] font-mono mb-2">
                STARTING...
              </div>
              <div className="text-sm text-[#9ca3af]">
                Place your bets
              </div>
              <div className="flex items-center justify-center gap-1 mt-3">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#7c3aed]"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
                  />
                ))}
              </div>
            </motion.div>
          ) : phase === "crashed" ? (
            <motion.div
              key="crashed"
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              <div
                className={`text-5xl sm:text-7xl font-black font-mono ${multiplierColor} ${multiplierGlow}`}
              >
                {crashPoint?.toFixed(2)}x
              </div>
              <motion.div
                className="text-lg font-semibold text-[#ef4444] mt-2"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              >
                CRASHED!
              </motion.div>

              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-[#ef4444]"
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: Math.cos((i / 12) * Math.PI * 2) * 100,
                      y: Math.sin((i / 12) * Math.PI * 2) * 100,
                      opacity: 0,
                      scale: 0,
                    }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="running"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <motion.div
                className={`text-5xl sm:text-7xl font-black font-mono ${multiplierColor} ${multiplierGlow}`}
                key={Math.floor(multiplier * 10)}
              >
                {multiplier.toFixed(2)}x
              </motion.div>
              <div className="text-sm text-[#a78bfa] mt-2 font-medium tracking-wider">
                CURRENT PAYOUT
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {phase === "running" && graphPoints.length > 2 && (
        <motion.div
          className="absolute pointer-events-none z-20"
          style={{
            left: rocketScreenPos.x,
            top: rocketScreenPos.y,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          <motion.div
            style={{ transformOrigin: '0 0' }}
            animate={{ rotate: rocketScreenPos.angle }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <img 
              src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNG45NThxcmF3OGI1MXVncWJla3dqZTJzOW53eGN2OG81bjhuemducyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/HYI4lPnqmgJVXxtSIM/giphy.gif"
              alt="Rocket"
              className="w-30 h-30 drop-shadow-[0_0_12px_rgba(239,68,68,0.9)]"
              style={{ 
                objectFit: 'contain',
                transform: 'translate(-24px, -96px)'
              }}
            />

            <motion.div
              className="absolute rounded-full"
              style={{
                left: '0px',
                top: '0px',
                width: '40px',
                height: '4px',
                transformOrigin: 'right center',
                transform: 'translateX(-100%) translateY(-50%)',
                background: "linear-gradient(90deg, transparent 0%, rgba(251, 191, 36, 0.6) 30%, rgba(239, 68, 68, 0.8) 100%)",
              }}
              animate={{
                scaleX: [0.7, 1.2, 0.7],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{
                duration: 0.3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </motion.div>
      )}

      {phase === "crashed" && crashPos.x !== 0 && (
        <motion.div
          className="absolute pointer-events-none z-30"
          style={{
            left: crashPos.x,
            top: crashPos.y,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1.2 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <img 
            src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZTNneXlkZzQ1am00MmdjYjk1d2Nwa2pwM3M5Nmw2bHl4M2EyeHF4ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/4Z9p5iVHTo3CWW1Lpe/giphy.gif"
            alt="Explosion"
            className="w-40 h-40"
            style={{ objectFit: 'contain' }}
          />
        </motion.div>
      )}
    </div>
  );
}
