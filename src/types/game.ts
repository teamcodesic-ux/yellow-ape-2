export type GameStatus = "lobby" | "active" | "ended";
export type PendingActionType = "start" | "close";

export interface LobbyPlayer {
  wallet: `0x${string}`;
  multiplier: number;
  betAmount: number;
}

export interface PendingActionView {
  id: string;
  type: PendingActionType;
  method: string;
  requiredWallets: `0x${string}`[];
  signedWallets: `0x${string}`[];
  createdAt: string;
}

export interface GameState {
  players: LobbyPlayer[];
  status: GameStatus;
  crashMultiplier: number | null;
  winners: `0x${string}`[];
  yellowSessionId: `0x${string}` | null;
  tokenAddress: `0x${string}` | null;
  pendingAction: PendingActionView | null;
  settlementTxHashes: `0x${string}`[];
  error: string | null;
  updatedAt: string;
}
