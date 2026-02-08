"use client";

import { motion } from "framer-motion";
import { Zap, Shield, CheckCircle, Coins } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Instant Settlements",
    description:
      "Sub-second bet confirmations via state channels. No waiting for block confirmations.",
    color: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.3)",
  },
  {
    icon: Shield,
    title: "Self-Custodial",
    description:
      "You control your funds via state channels. Your keys, your crypto, always.",
    color: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.3)",
  },
  {
    icon: CheckCircle,
    title: "Provably Fair",
    description:
      "Every round verified by Chainlink VRF. Transparent, tamper-proof randomness.",
    color: "#10b981",
    glow: "rgba(16, 185, 129, 0.3)",
  },
  {
    icon: Coins,
    title: "Low Fees",
    description:
      "Only 2 gas fees for unlimited rounds. Open a channel, play forever.",
    color: "#a78bfa",
    glow: "rgba(167, 139, 250, 0.3)",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function FeaturesGrid() {
  return (
    <section id="features" className="relative py-24 px-4">
      <div className="max-w-6xl mx-auto">
      
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Why Choose <span className="text-[#a78bfa]">CrashX</span>?
          </h2>
          <p className="text-[#9ca3af] text-lg max-w-xl mx-auto">
            Built on cutting-edge blockchain technology for the best crash gaming experience.
          </p>
        </motion.div>

   
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={item}
              className="glass p-6 group hover:scale-[1.03] transition-transform duration-300 cursor-default"
              whileHover={{
                boxShadow: `0 0 30px ${feature.glow}, 0 0 60px ${feature.glow}`,
              }}
            >
          
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl mb-5"
                style={{
                  background: `linear-gradient(135deg, ${feature.color}20, ${feature.color}10)`,
                  border: `1px solid ${feature.color}30`,
                }}
              >
                <feature.icon className="w-7 h-7" style={{ color: feature.color }} />
              </div>

              <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-[#9ca3af] text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
