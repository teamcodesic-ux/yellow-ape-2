"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Rocket, Wallet } from "lucide-react";

export default function Navbar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/10"
      style={{ background: "rgba(10, 14, 39, 0.8)", backdropFilter: "blur(12px)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
 
         <Link href="/" className="flex items-center gap-2" aria-label="CrashX Home">
          <span className="text-3xl font-bold text-white hidden sm:block">
            Higher!!
          </span>
          </Link>

        <div className="hidden md:flex items-center gap-8">
          
        </div>

        <Link href="/game">
          <button
            className="btn-gradient px-5 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center gap-2 neon-glow-sm"
            aria-label="Connect Wallet"
          >
            Launch App
          </button>
        </Link>

      </div>
    </motion.nav>
  );
}
