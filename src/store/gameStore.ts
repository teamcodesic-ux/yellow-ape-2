import { create } from "zustand";

export type GamePhase = "waiting" | "running" | "crashed";

export interface Player {
  id: string;
  name: string;
  avatar: string;
  betAmount: number;
  currency: string;
  cashedOut: boolean;
  cashoutMultiplier?: number;
}

export interface HistoryEntry {
  id: string;
  crashPoint: number;
  timestamp: number;
}

interface GameState {
  // Game state
  phase: GamePhase;
  multiplier: number;
  crashPoint: number | null;
  elapsed: number;
  roundId: number;
  
  // Betting
  betAmount: number;
  autoCashout: number | null;
  hasBet: boolean;
  hasCashedOut: boolean;
  mode: "manual" | "auto";

  // Data
  players: Player[];
  history: HistoryEntry[];
  balance: number;
  totalPlayers: number;
  totalPool: number;

  // Multiplier data points for graph
  graphPoints: { time: number; value: number }[];

  // Actions
  setBetAmount: (amount: number) => void;
  setAutoCashout: (value: number | null) => void;
  setMode: (mode: "manual" | "auto") => void;
  placeBet: () => void;
  cashOut: () => void;
  setPhase: (phase: GamePhase) => void;
  setMultiplier: (multiplier: number) => void;
  setCrashPoint: (point: number) => void;
  addGraphPoint: (point: { time: number; value: number }) => void;
  resetRound: () => void;
  startRound: () => void;
  crashRound: (point: number) => void;
  setBalance: (balance: number) => void;
}

const MOCK_PLAYERS: Player[] = [
  { id: "1", name: "CryptoKing", avatar: "👑", betAmount: 500, currency: "USDC", cashedOut: false },
  { id: "2", name: "RocketMan", avatar: "🚀", betAmount: 250.5, currency: "USDC", cashedOut: false },
  { id: "3", name: "LuckyDraw", avatar: "🎰", betAmount: 1200, currency: "USDC", cashedOut: false },
  { id: "4", name: "MoonShot", avatar: "🌙", betAmount: 75, currency: "USDC", cashedOut: false },
  { id: "5", name: "DiamondH", avatar: "💎", betAmount: 329.57, currency: "USDC", cashedOut: false },
];

const MOCK_HISTORY: HistoryEntry[] = [
  { id: "h1", crashPoint: 3.72, timestamp: Date.now() - 60000 },
  { id: "h2", crashPoint: 1.52, timestamp: Date.now() - 50000 },
  { id: "h3", crashPoint: 2.97, timestamp: Date.now() - 40000 },
  { id: "h4", crashPoint: 1.79, timestamp: Date.now() - 30000 },
  { id: "h5", crashPoint: 5.21, timestamp: Date.now() - 25000 },
  { id: "h6", crashPoint: 1.05, timestamp: Date.now() - 20000 },
  { id: "h7", crashPoint: 2.34, timestamp: Date.now() - 15000 },
  { id: "h8", crashPoint: 8.44, timestamp: Date.now() - 10000 },
  { id: "h9", crashPoint: 1.23, timestamp: Date.now() - 8000 },
  { id: "h10", crashPoint: 4.15, timestamp: Date.now() - 5000 },
  { id: "h11", crashPoint: 1.88, timestamp: Date.now() - 3000 },
  { id: "h12", crashPoint: 12.05, timestamp: Date.now() - 2000 },
  { id: "h13", crashPoint: 2.11, timestamp: Date.now() - 1000 },
];

export const useGameStore = create<GameState>((set, get) => ({
  phase: "waiting",
  multiplier: 1.0,
  crashPoint: null,
  elapsed: 0,
  roundId: 1,

  betAmount: 10,
  autoCashout: null,
  hasBet: false,
  hasCashedOut: false,
  mode: "manual",

  players: MOCK_PLAYERS,
  history: MOCK_HISTORY,
  balance: 1000,
  totalPlayers: MOCK_PLAYERS.length,
  totalPool: MOCK_PLAYERS.reduce((s, p) => s + p.betAmount, 0),

  graphPoints: [],

  setBetAmount: (amount) => set({ betAmount: Math.max(0, amount) }),
  setAutoCashout: (value) => set({ autoCashout: value }),
  setMode: (mode) => set({ mode }),

  placeBet: () => {
    const { betAmount, balance } = get();
    if (betAmount > balance || betAmount <= 0) return;
    set({
      hasBet: true,
      hasCashedOut: false,
      balance: balance - betAmount,
    });
  },

  cashOut: () => {
    const { multiplier, betAmount, balance, hasBet, hasCashedOut } = get();
    if (!hasBet || hasCashedOut) return;
    const winnings = betAmount * multiplier;
    set({
      hasCashedOut: true,
      balance: balance + winnings,
    });
  },

  setPhase: (phase) => set({ phase }),
  setMultiplier: (multiplier) => set({ multiplier }),
  setCrashPoint: (point) => set({ crashPoint: point }),
  addGraphPoint: (point) =>
    set((state) => ({ graphPoints: [...state.graphPoints, point] })),

  resetRound: () =>
    set({
      phase: "waiting",
      multiplier: 1.0,
      crashPoint: null,
      elapsed: 0,
      hasBet: false,
      hasCashedOut: false,
      graphPoints: [],
      players: MOCK_PLAYERS.map((p) => ({ ...p, cashedOut: false, cashoutMultiplier: undefined })),
    }),

  startRound: () =>
    set((state) => ({
      phase: "running",
      multiplier: 1.0,
      graphPoints: [{ time: 0, value: 1.0 }],
      roundId: state.roundId + 1,
    })),

  crashRound: (point) =>
    set((state) => ({
      phase: "crashed",
      crashPoint: point,
      multiplier: point,
      history: [
        { id: `h-${Date.now()}`, crashPoint: point, timestamp: Date.now() },
        ...state.history,
      ].slice(0, 25),
    })),

  setBalance: (balance) => set({ balance }),
}));
