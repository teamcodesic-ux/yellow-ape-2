"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Droplets, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useAccount } from "wagmi";

interface FaucetResponse {
  success: boolean;
  message: string;
  txId?: string;
  amount?: string;
  asset?: string;
  destination?: string;
}

interface FaucetModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress?: string | null;
  onSuccess?: () => void;
}

export default function FaucetModal({ isOpen, onClose, walletAddress: externalAddress, onSuccess }: FaucetModalProps) {
  const { address: connectedAddress } = useAccount();
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [response, setResponse] = useState<FaucetResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      const addr = externalAddress || connectedAddress || "";
      if (addr) setWalletAddress(addr);
    }
  }, [isOpen, externalAddress, connectedAddress]);

  const requestTokens = useCallback(async () => {
    if (!walletAddress) {
      setErrorMessage("Please connect your wallet or enter an address.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    setResponse(null);

    try {
      const res = await fetch(
        "https://clearnet-sandbox.yellow.com/faucet/requestTokens",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: walletAddress }),
        }
      );

      const data: FaucetResponse = await res.json();

      if (data.success) {
        setStatus("success");
        setResponse(data);
        if (onSuccess) {
          setTimeout(onSuccess, 2000);
        }
      } else {
        setStatus("error");
        setErrorMessage(data.message || "Faucet request failed.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, [walletAddress, onSuccess]);

  const formatAmount = (raw: string) => {
    const num = Number(raw);
    if (isNaN(num)) return raw;
    return (num / 1_000_000).toFixed(2);
  };

  const handleClose = () => {
    setStatus("idle");
    setResponse(null);
    setErrorMessage("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative w-full max-w-md glass border border-white/10 rounded-2xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#10b981] flex items-center justify-center">
                  <Droplets className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Testnet Faucet</h2>
                  <p className="text-xs text-[#9ca3af]">Get free test tokens</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-[#9ca3af] mb-2 block">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => {
                    setWalletAddress(e.target.value);
                    setStatus("idle");
                    setErrorMessage("");
                  }}
                  placeholder="0x..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-[#9ca3af]/50 outline-none focus:border-[#7c3aed]/50 transition-colors"
                />
                {!connectedAddress && (
                  <p className="text-xs text-[#9ca3af] mt-2">
                    Connect your wallet via the navbar button to auto-fill this field.
                  </p>
                )}
              </div>

              {status === "error" && errorMessage && (
                <motion.div
                  className="flex items-start gap-3 p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/20"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#f87171]">{errorMessage}</p>
                </motion.div>
              )}

              {status === "success" && response && (
                <motion.div
                  className="p-4 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20 space-y-3"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-[#10b981]" />
                    <span className="text-sm font-semibold text-[#34d399]">
                      Tokens sent successfully
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#9ca3af]">Amount</span>
                      <span className="font-mono font-bold text-white">
                        {formatAmount(response.amount || "0")} {response.asset || ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#9ca3af]">Tx ID</span>
                      <span className="font-mono text-[#a78bfa]">
                        {response.txId}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#9ca3af]">Destination</span>
                      <span className="font-mono text-white text-xs truncate max-w-[200px]">
                        {response.destination}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              <button
                onClick={requestTokens}
                disabled={status === "loading" || !walletAddress}
                className="w-full btn-gradient px-6 py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Requesting Tokens...
                  </>
                ) : status === "success" ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Request More
                  </>
                ) : (
                  <>
                    <Droplets className="w-5 h-5" />
                    Request Tokens
                  </>
                )}
              </button>

              <p className="text-xs text-center text-[#9ca3af]">
                Tokens are for testnet use only. Each request sends test tokens to your wallet.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
