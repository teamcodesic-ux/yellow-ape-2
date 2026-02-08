import type { GameState } from "./game";

export type RequestPayload = [number, string, Record<string, unknown>, number?];

export type StateResponse = GameState & { canStart: boolean };

export type PublicConfig = {
  chainId: number;
  assetId: string;
  tokenAddress: `0x${string}` | null;
  tokenSymbol: string;
  adminWallet: `0x${string}` | null;
  error: string | null;
};

export type UnifiedBalanceResponse = {
  wallet: `0x${string}` | null;
  asset: string;
  amount: string;
  error: string | null;
};

export type WithdrawOnchainPrepareResponse = {
  actionId: string;
  flow: "withdraw" | "open_channel";
  requestPayloads: RequestPayload[];
  requestMethods: Array<"create_channel" | "resize_channel">;
  amount: string;
  amountBaseUnits: string;
  tokenAddress: `0x${string}`;
  custodyAddress: `0x${string}`;
  channelCount: number;
  perChannelAmountsBaseUnits: string[];
};

export type WithdrawOnchainExecuteResponse = {
  actionId: string;
  flow: "withdraw" | "open_channel";
  wallet: `0x${string}`;
  amount: string;
  amountBaseUnits: string;
  tokenAddress: `0x${string}`;
  custodyAddress: `0x${string}`;
  txCount: number;
  txs: Array<{
    kind: "create" | "resize";
    channelId: `0x${string}`;
    amountBaseUnits: string;
    to: `0x${string}`;
    data: `0x${string}`;
  }>;
};

export type WalletWithdrawalPrepareResponse = {
  actionId: string;
  channelId: string;
  amount: string;
  amountBaseUnits: string;
  tokenAddress: string;
  closeRequestPayload: RequestPayload;
};

export type WalletWithdrawalExecuteResponse = {
  channelId: string;
  amount: string;
  closeTxHash: string;
  withdrawalTxHash: string;
};

export type PendingActionDetails = {
  id: string;
  type: "start" | "close";
  method: string;
  requestPayload: RequestPayload;
  requiredWallets: `0x${string}`[];
  signedWallets: `0x${string}`[];
  missingWallets: `0x${string}`[];
  createdAt: string;
};

export type PendingActionResponse = {
  pendingAction: PendingActionDetails | null;
};

export type ParticipantAuthChallenge = {
  authToken: string;
  challenge: string;
  expiresAt: number;
  scope: string;
  appName: string;
  allowances: Array<{ asset: string; amount: string }>;
};

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
