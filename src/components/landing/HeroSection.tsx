"use client";

import { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { Rocket, TrendingUp, Zap, Shield, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

function AnimatedGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
      <div className="absolute inset-0" style={{
        backgroundImage: `linear-gradient(rgba(167, 139, 250, 0.1) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(167, 139, 250, 0.1) 1px, transparent 1px)`,
        backgroundSize: '50px 50px',
      }} />
    </div>
  );
}

function FloatingOrbs() {
  return (
    <>
      <motion.div
        className="absolute top-20 left-[10%] w-72 h-72 bg-[#7c3aed]/30 rounded-full blur-3xl"
        animate={{
          y: [0, 30, 0],
          x: [0, 20, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute bottom-20 right-[10%] w-96 h-96 bg-[#ef4444]/20 rounded-full blur-3xl"
        animate={{
          y: [0, -40, 0],
          x: [0, -30, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#a78bfa]/10 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </>
  );
}

function LiveMultiplier() {
  const [multiplier, setMultiplier] = useState(1.00);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const runDemo = () => {
      setIsActive(true);
      setMultiplier(1.00);
      
      const startTime = Date.now();
      const duration = 3000 + Math.random() * 2000;
      
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= duration) {
          clearInterval(interval);
          setIsActive(false);
          setTimeout(runDemo, 2000);
        } else {
          const progress = elapsed / duration;
          const newMultiplier = 1.00 + (progress * progress * 15);
          setMultiplier(newMultiplier);
        }
      }, 50);
    };

    runDemo();
  }, []);

  return (
    <motion.div
      className="inline-block"
      animate={isActive ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 0.5, repeat: isActive ? Infinity : 0 }}
    >
      <div className="glass px-8 py-4 rounded-2xl border-2 border-[#7c3aed]/40 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-[#7c3aed]/20 to-[#ef4444]/20"
          animate={isActive ? { x: ["-100%", "100%"] } : {}}
          transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
        />
        <div className="relative flex items-center gap-3">
          <TrendingUp className={`w-6 h-6 ${isActive ? 'text-[#10b981]' : 'text-[#9ca3af]'}`} />
          <div className="font-mono text-3xl font-bold">
            <span className={isActive ? 'text-[#10b981]' : 'text-white'}>
              {multiplier.toFixed(2)}x
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FeatureBadge({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <motion.div
      className="glass-subtle px-4 py-2 rounded-full flex items-center gap-2"
      whileHover={{ scale: 1.05, backgroundColor: "rgba(167, 139, 250, 0.1)" }}
    >
      <Icon className="w-4 h-4 text-[#a78bfa]" />
      <span className="text-sm text-white font-medium">{text}</span>
    </motion.div>
  );
}

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-12">
  
      <div className="absolute inset-0">
        <AnimatedGrid />
        <FloatingOrbs />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <div className="text-center">
       
          <motion.div
            className="mb-8 inline-block"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="glass-subtle px-5 py-2 rounded-full border border-[#7c3aed]/30">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#a78bfa]" />
                <span className="text-sm text-white font-medium">
                  Powered by yellow network
                </span>
              </div>
            </div>
          </motion.div>

         
          <motion.h1
            className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black text-white mb-6 tracking-tight leading-[1.1]"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            Watch the{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-[#7c3aed] via-[#a78bfa] to-[#ef4444] bg-clip-text text-transparent">
                Multiplier
              </span>
              <motion.div
                className="absolute -inset-2 bg-gradient-to-r from-[#7c3aed]/20 to-[#ef4444]/20 blur-xl -z-10"
                animate={{ opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </span>
            <br />
            <span className="text-white">Soar to the Moon</span>
          </motion.h1>

        
          <motion.p
            className="text-lg sm:text-xl lg:text-2xl text-[#9ca3af] max-w-3xl mx-auto mb-8 leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            The most advanced crash game on blockchain.{" "}
            <span className="text-white font-semibold">
              Instant settlements, zero gas fees, total control.
            </span>
          </motion.p>

      
          <motion.div
            className="flex flex-wrap items-center justify-center gap-3 mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <FeatureBadge icon={Zap} text="Instant Play" />
            <FeatureBadge icon={Shield} text="Self-Custodial" />
            <FeatureBadge icon={TrendingUp} text="Provably Fair" />
          </motion.div>

         
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            <LiveMultiplier />
          </motion.div>

       
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            
          </motion.div>

   
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
          >
            {[
              { label: "AVG. ROUND TIME", value: "8s", suffix: "" },
              { label: "HOUSE EDGE", value: "3.5", suffix: "%" },
              { label: "MAX MULTIPLIER", value: "1000", suffix: "x" },
              { label: "MIN. BET", value: "1", suffix: "yt.USD" },
            ].map((stat, idx) => (
              <motion.div
                key={stat.label}
                className="glass-subtle p-6 rounded-2xl border border-white/5"
                whileHover={{ 
                  borderColor: "rgba(124, 58, 237, 0.3)",
                  boxShadow: "0 0 20px rgba(124, 58, 237, 0.2)"
                }}
              >
                <div className="text-3xl sm:text-4xl font-bold text-white font-mono mb-1">
                  {stat.value}
                  <span className="text-[#a78bfa]">{stat.suffix}</span>
                </div>
                <div className="text-xs text-[#9ca3af] font-semibold tracking-wider">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

  
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 10, 0] }}
        transition={{ opacity: { delay: 1 }, y: { duration: 2, repeat: Infinity } }}
      >
        <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-2">
          <motion.div
            className="w-1.5 h-1.5 bg-white rounded-full"
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </motion.div>
    </section>
  );
}
