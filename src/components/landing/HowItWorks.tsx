"use client";

import { motion } from "framer-motion";
import { Wallet, Lock, Rocket, Banknote } from "lucide-react";

const steps = [
  {
    icon: Wallet,
    title: "Connect Wallet",
    description: "Link your Web3 wallet to get started in seconds.",
    color: "#7c3aed",
  },
  {
    icon: Lock,
    title: "Open Channel",
    description: "Deposit funds into a state channel for instant play.",
    color: "#3b82f6",
  },
  {
    icon: Rocket,
    title: "Play Unlimited Rounds",
    description: "Bet, watch the multiplier climb, and cash out before it crashes.",
    color: "#10b981",
  },
  {
    icon: Banknote,
    title: "Withdraw Anytime",
    description: "Close your channel and withdraw your funds instantly.",
    color: "#fbbf24",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 px-4">
      <div className="max-w-5xl mx-auto">
    
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            How It <span className="text-[#a78bfa]">Works</span>
          </h2>
          <p className="text-[#9ca3af] text-lg max-w-xl mx-auto">
            Get started in four simple steps. It&apos;s that easy.
          </p>
        </motion.div>

   
        <div className="relative">
      
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-[#7c3aed] via-[#3b82f6] via-[#10b981] to-[#fbbf24] hidden lg:block -translate-y-1/2 opacity-30" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                className="relative text-center"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
              >
               
                <div className="text-xs font-bold text-[#9ca3af] mb-3 tracking-widest uppercase">
                  Step {index + 1}
                </div>

              
                <motion.div
                  className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center relative"
                  style={{
                    background: `linear-gradient(135deg, ${step.color}30, ${step.color}10)`,
                    border: `2px solid ${step.color}40`,
                  }}
                  whileHover={{
                    scale: 1.1,
                    boxShadow: `0 0 30px ${step.color}50`,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <step.icon className="w-9 h-9" style={{ color: step.color }} />
                </motion.div>

                <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                <p className="text-[#9ca3af] text-sm leading-relaxed max-w-[220px] mx-auto">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
