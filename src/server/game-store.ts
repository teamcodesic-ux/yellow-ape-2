import { getAddress } from "viem";
import type { GameState, LobbyPlayer, PendingActionType, PendingActionView } from "@/types/game";

export const MIN_PLAYERS = 1;
export const MIN_MULTIPLIER = 1.01;
export const MAX_MULTIPLIER = 10;
export const MIN_BET_AMOUNT = 0.01;
export const MAX_BET_AMOUNT = 1_000_000;

export type RequestPayload = [number, string, Record<string, unknown>, number?];

export interface ParticipantSessionAuth {
  wallet: `0x${string}`;
  sessionKey: `0x${string}`;
  jwtToken?: string;
  expiresAt: number;
  scope: string;
  appName: string;
  authenticatedAt: string;
}

export interface StartActionMeta {
  type: "start";
  players: LobbyPlayer[];
  winners: `0x${string}`[];
  crashMultiplier: number;
  tokenAddress: `0x${string}`;
  adminSessionPrivateKey: `0x${string}`;
}

export interface CloseActionMeta {
  type: "close";
  players: LobbyPlayer[];
  winners: `0x${string}`[];
  crashMultiplier: number;
  appSessionId: `0x${string}`;
  tokenAddress: `0x${string}`;
  adminSessionPrivateKey: `0x${string}`;
}

export type PendingActionMeta = StartActionMeta | CloseActionMeta;

export interface PendingActionInternal {
  id: string;
  type: PendingActionType;
  method: string;
  requestPayload: RequestPayload;
  requiredWallets: `0x${string}`[];
  signaturesByWallet: Record<`0x${string}`, `0x${string}`>;
  createdAt: string;
  meta: PendingActionMeta;
}

interface InternalGameState extends GameState {
  roundPlayers: LobbyPlayer[];
}

const INITIAL_STATE: InternalGameState = {
  players: [],
  roundPlayers: [],
  status: "lobby",
  crashMultiplier: null,
  winners: [],
  yellowSessionId: null,
  tokenAddress: null,
  pendingAction: null,
  settlementTxHashes: [],
  error: null,
  updatedAt: new Date(0).toISOString(),
};

function nowIso(): string {
  return new Date().toISOString();
}

function toSafeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeWallet(wallet: string): `0x${string}` {
  return getAddress(wallet.trim());
}

function clonePlayer(player: LobbyPlayer): LobbyPlayer {
  return {
    wallet: player.wallet,
    multiplier: toSafeNumber(player.multiplier, 0),
    betAmount: toSafeNumber(player.betAmount, 0),
  };
}

function clonePendingAction(action: PendingActionInternal | null): PendingActionInternal | null {
  if (!action) {
    return null;
  }

  return {
    ...action,
    requestPayload: [...action.requestPayload] as RequestPayload,
    requiredWallets: [...action.requiredWallets],
    signaturesByWallet: { ...action.signaturesByWallet },
    meta: {
      ...action.meta,
      players: action.meta.players.map(clonePlayer),
      winners: [...action.meta.winners],
    } as PendingActionMeta,
  };
}

function toPendingActionView(action: PendingActionInternal | null): PendingActionView | null {
  if (!action) {
    return null;
  }

  return {
    id: action.id,
    type: action.type,
    method: action.method,
    requiredWallets: [...action.requiredWallets],
    signedWallets: Object.keys(action.signaturesByWallet).map((wallet) => wallet as `0x${string}`),
    createdAt: action.createdAt,
  };
}

function cloneState(state: InternalGameState, pendingAction: PendingActionInternal | null): GameState {
  return {
    players: state.players.map(clonePlayer),
    status: state.status,
    crashMultiplier: state.crashMultiplier,
    winners: [...state.winners],
    yellowSessionId: state.yellowSessionId,
    tokenAddress: state.tokenAddress,
    pendingAction: toPendingActionView(pendingAction),
    settlementTxHashes: [...state.settlementTxHashes],
    error: state.error,
    updatedAt: state.updatedAt,
  };
}

export function isValidMultiplier(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_MULTIPLIER && value <= MAX_MULTIPLIER;
}

export function isValidBetAmount(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_BET_AMOUNT && value <= MAX_BET_AMOUNT;
}

export function canStartGame(players: LobbyPlayer[]): boolean {
  return (
    players.length >= MIN_PLAYERS &&
    players.every(
      (player) => isValidMultiplier(player.multiplier) && isValidBetAmount(player.betAmount),
    )
  );
}

export function generateCrashMultiplier(randomValue: number = Math.random()): number {
  const boundedRandom = Math.max(0, Math.min(1, randomValue));
  const multiplier = MIN_MULTIPLIER + boundedRandom * (MAX_MULTIPLIER - MIN_MULTIPLIER);
  return Number(multiplier.toFixed(2));
}

export function computeWinners(players: LobbyPlayer[], crashMultiplier: number): `0x${string}`[] {
  return players
    .filter((player) => player.multiplier < crashMultiplier)
    .map((player) => player.wallet);
}

class GameStore {
  private state: InternalGameState = {
    ...INITIAL_STATE,
    updatedAt: nowIso(),
  };

  private participantSessions = new Map<`0x${string}`, ParticipantSessionAuth>();
  private pendingAction: PendingActionInternal | null = null;

  private updateTimestamp(): void {
    this.state.updatedAt = nowIso();
  }

  private assertLobbyMutable(): void {
    if (this.state.status === "active") {
      throw new Error("Cannot change lobby while a session is active");
    }
    if (this.pendingAction) {
      throw new Error("Cannot change lobby while signatures are being collected");
    }
  }

  getState(): GameState {
    return cloneState(this.state, this.pendingAction);
  }

  clearError(): void {
    this.state.error = null;
    this.updateTimestamp();
  }

  setError(error: string | null): void {
    this.state.error = error;
    this.updateTimestamp();
  }

  upsertPlayer(walletInput: string, multiplier: number, betAmount: number): GameState {
    this.assertLobbyMutable();

    if (!isValidMultiplier(multiplier)) {
      throw new Error(`Multiplier must be between ${MIN_MULTIPLIER} and ${MAX_MULTIPLIER}`);
    }

    if (!isValidBetAmount(betAmount)) {
      throw new Error(`Bet amount must be between ${MIN_BET_AMOUNT} and ${MAX_BET_AMOUNT}`);
    }

    const wallet = normalizeWallet(walletInput);
    const existingIndex = this.state.players.findIndex((player) => player.wallet === wallet);
    const nextPlayer: LobbyPlayer = { wallet, multiplier, betAmount };

    if (existingIndex >= 0) {
      this.state.players[existingIndex] = nextPlayer;
    } else {
      this.state.players.push(nextPlayer);
    }

    this.state.status = "lobby";
    this.state.error = null;
    this.updateTimestamp();
    return this.getState();
  }

  removePlayer(walletInput: string): GameState {
    this.assertLobbyMutable();

    const wallet = normalizeWallet(walletInput);
    this.state.players = this.state.players.filter((player) => player.wallet !== wallet);
    this.participantSessions.delete(wallet);
    this.state.error = null;
    this.updateTimestamp();
    return this.getState();
  }

  setParticipantSessionAuth(auth: ParticipantSessionAuth): void {
    this.participantSessions.set(auth.wallet, auth);
    this.updateTimestamp();
  }

  getParticipantSessionAuth(walletInput: string): ParticipantSessionAuth | null {
    const wallet = normalizeWallet(walletInput);
    return this.participantSessions.get(wallet) ?? null;
  }

  getMissingSessionAuth(wallets: `0x${string}`[]): `0x${string}`[] {
    return wallets.filter((wallet) => !this.participantSessions.has(wallet));
  }

  setPendingAction(action: PendingActionInternal): void {
    if (this.pendingAction) {
      throw new Error("A pending action already exists");
    }

    this.pendingAction = clonePendingAction(action);
    this.state.error = null;
    this.updateTimestamp();
  }

  getPendingAction(): PendingActionInternal | null {
    return clonePendingAction(this.pendingAction);
  }

  addPendingSignature(actionId: string, walletInput: string, signature: `0x${string}`): PendingActionInternal {
    if (!this.pendingAction || this.pendingAction.id !== actionId) {
      throw new Error("Pending action not found");
    }

    const wallet = normalizeWallet(walletInput);
    if (!this.pendingAction.requiredWallets.includes(wallet)) {
      throw new Error("Wallet is not part of required signers");
    }

    this.pendingAction.signaturesByWallet[wallet] = signature;
    this.updateTimestamp();
    return this.getPendingAction() as PendingActionInternal;
  }

  clearPendingAction(): void {
    this.pendingAction = null;
    this.updateTimestamp();
  }

  isPendingActionFullySigned(action: PendingActionInternal): boolean {
    return action.requiredWallets.every((wallet) => !!action.signaturesByWallet[wallet]);
  }

  startRound(params: {
    yellowSessionId: `0x${string}`;
    crashMultiplier: number;
    winners: `0x${string}`[];
    tokenAddress: `0x${string}`;
  }): GameState {
    if (!canStartGame(this.state.players)) {
      throw new Error("Not enough valid players to start session");
    }

    this.state.status = "active";
    this.state.yellowSessionId = params.yellowSessionId;
    this.state.crashMultiplier = params.crashMultiplier;
    this.state.winners = [...params.winners];
    this.state.tokenAddress = params.tokenAddress;
    this.state.roundPlayers = this.state.players.map(clonePlayer);
    this.state.settlementTxHashes = [];
    this.state.error = null;
    this.updateTimestamp();

    return this.getState();
  }

  finishRound(params?: { settlementTxHashes?: `0x${string}`[] }): GameState {
    if (this.state.status !== "active") {
      throw new Error("No active session to end");
    }

    this.state.status = "ended";
    this.state.yellowSessionId = null;
    this.state.roundPlayers = [];
    this.state.settlementTxHashes = params?.settlementTxHashes ?? [];
    this.state.error = null;
    this.updateTimestamp();

    return this.getState();
  }

  /** Transition from "ended" back to "lobby" so players can place new bets. */
  resetToLobby(): GameState {
    if (this.state.status !== "ended") {
      throw new Error("Can only reset to lobby from ended state");
    }

    this.state.status = "lobby";
    this.state.crashMultiplier = null;
    this.state.winners = [];
    this.state.settlementTxHashes = [];
    this.state.error = null;
    this.updateTimestamp();

    return this.getState();
  }

  getRoundPlayers(): LobbyPlayer[] {
    if (this.state.status !== "active") {
      return [];
    }

    return this.state.roundPlayers.map(clonePlayer);
  }
}

declare global {
  var __crashGameStore: GameStore | undefined;
}

export const gameStore = globalThis.__crashGameStore ?? new GameStore();

if (!globalThis.__crashGameStore) {
  globalThis.__crashGameStore = gameStore;
}
