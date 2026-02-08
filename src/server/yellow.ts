import "server-only";

import {
  NitroliteRPC,
  RPCChannelStatus,
  RPCMethod,
  RPCProtocolVersion,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAuthVerifyMessageFromChallenge,
  createAuthVerifyMessageWithJWT,
  createCloseChannelMessage,
  createECDSAMessageSigner,
  createEIP712AuthMessageSigner,
  createGetAssetsMessageV2,
  createGetChannelsMessageV2,
  createGetConfigMessageV2,
  createGetLedgerTransactionsMessageV2,
  parseAnyRPCResponse,
  type AuthChallengeResponse,
  type RPCAppDefinition,
  type RPCAppSessionAllocation,
  type RPCAsset,
  type RPCResponse,
} from "@erc7824/nitrolite";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseUnits,
  recoverAddress,
  toHex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import WebSocket from "ws";
import type {
  CloseActionMeta,
  PendingActionInternal,
  RequestPayload,
  StartActionMeta,
} from "@/server/game-store";
import type { LobbyPlayer } from "@/types/game";
import { erc20Abi } from "@/lib/erc20";

const DEFAULT_WS_URL = "wss://clearnet-sandbox.yellow.com/ws";
const DEFAULT_APP_NAME = "crash-test-app";
const DEFAULT_ASSET_ID = "ytest.usd";
const DEFAULT_CHAIN_ID = 84532;
const DEFAULT_AUTH_ALLOWANCE = "1000000";
const AUTH_SESSION_SECONDS = 60 * 60;
const MAX_TIMEOUT_MS = 20_000;
const SIGNING_PRECISION = 1_000_000;
const UNIFIED_BALANCE_CACHE_TTL_MS = 8_000;
const UNIFIED_BALANCE_PAGE_LIMIT = 100;
const UNIFIED_BALANCE_MAX_PAGES = 50;
const CHANNEL_INDEXING_POLL_MS = 1_500;
const CHANNEL_INDEXING_MAX_ATTEMPTS = 20; // 30 seconds total
const CHANNEL_HINT_TTL_MS = 60 * 60 * 1000; // 1 hour - longer window for users to cash out

type OpenWebSocket = WebSocket;

interface YellowTokenCache {
  tokenAddress: `0x${string}`;
  symbol: string;
  chainId: number;
  decimals: number;
  resolvedAt: number;
}

interface AdminAuthContext {
  adminAddress: `0x${string}`;
  adminSessionPrivateKey: `0x${string}`;
  adminSessionSigner: ReturnType<typeof createECDSAMessageSigner>;
}

interface PlayerStake {
  wallet: `0x${string}`;
  betAmount: number;
}

export interface ParticipantAuthChallenge {
  authToken: string;
  challenge: string;
  expiresAt: number;
  scope: string;
  appName: string;
  allowances: Array<{ asset: string; amount: string }>;
}

export interface ParticipantAuthVerification {
  expiresAt: number;
  scope: string;
  appName: string;
  jwtToken?: string;
}

export type PendingActionExecutionResult =
  | {
      type: "start";
      appSessionId: `0x${string}`;
      tokenAddress: `0x${string}`;
    }
  | {
      type: "close";
      settlementTxHashes: `0x${string}`[];
      settlementError: string | null;
    };

let cachedToken: YellowTokenCache | null = null;
const AUTH_CHALLENGE_SESSION_TTL_SECONDS = 300;
const WITHDRAW_ACTION_TTL_MS = 60_000;

interface WithdrawOnchainAction {
  id: string;
  wallet: `0x${string}`;
  flow: "withdraw" | "open_channel";
  amount: string;
  amountBaseUnits: string;
  tokenAddress: `0x${string}`;
  custodyAddress: `0x${string}`;
  requestPayloads: RequestPayload[];
  requestMethods: Array<RPCMethod.CreateChannel | RPCMethod.ResizeChannel>;
  perChannelAmountsBaseUnits: string[];
  createdAt: number;
}

interface ParticipantAuthSessionState {
  authToken: string;
  wallet: `0x${string}`;
  sessionKey: `0x${string}`;
  challenge: string;
  expiresAt: number;
  scope: string;
  appName: string;
  allowances: Array<{ asset: string; amount: string }>;
  ws: OpenWebSocket;
  createdAt: number;
}

interface ChannelWithdrawalAction {
  id: string;
  wallet: `0x${string}`;
  channelId: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount: string;
  amountBaseUnits: string;
  closeRequestPayload: RequestPayload;
  createdAt: number;
}

const participantAuthSessions = new Map<string, ParticipantAuthSessionState>();
const unifiedBalanceCache = new Map<
  string,
  { wallet: `0x${string}`; asset: string; amount: string; resolvedAt: number }
>();
const withdrawOnchainActions = new Map<string, WithdrawOnchainAction>();
const channelWithdrawalActions = new Map<string, ChannelWithdrawalAction>();
const createdChannelHints = new Map<
  string,
  { channelId: `0x${string}`; wallet: `0x${string}`; tokenAddress: `0x${string}`; chainId: number; createdAt: number }
>();

function getWsUrl(): string {
  return process.env.YELLOW_WS_URL ?? DEFAULT_WS_URL;
}

function getAssetId(): string {
  return process.env.YELLOW_ASSET_ID ?? DEFAULT_ASSET_ID;
}

function getAppName(): string {
  return process.env.YELLOW_APP_NAME ?? DEFAULT_APP_NAME;
}

function getAuthAllowance(): string {
  return process.env.YELLOW_AUTH_ALLOWANCE ?? DEFAULT_AUTH_ALLOWANCE;
}

function getBaseChainId(): number {
  const raw = process.env.NEXT_PUBLIC_BASE_CHAIN_ID;
  if (!raw) {
    return DEFAULT_CHAIN_ID;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid NEXT_PUBLIC_BASE_CHAIN_ID: ${raw}`);
  }

  return parsed;
}

function getAdminPrivateKey(): `0x${string}` {
  const key = process.env.ADMIN_PRIVATE_KEY;

  if (!key) {
    throw new Error("ADMIN_PRIVATE_KEY is not set");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("ADMIN_PRIVATE_KEY must be a 32-byte hex string (0x + 64 hex chars)");
  }

  return key as `0x${string}`;
}

function getAdminAddress(): `0x${string}` {
  return getAddress(privateKeyToAccount(getAdminPrivateKey()).address);
}

function randomAuthToken(): string {
  return `auth_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
}

function cleanupExpiredParticipantAuthSessions(): void {
  const now = Date.now();

  for (const [token, session] of participantAuthSessions.entries()) {
    const expiredByChallenge = session.expiresAt * 1000 <= now;
    const expiredByTtl = session.createdAt + AUTH_CHALLENGE_SESSION_TTL_SECONDS * 1000 <= now;
    const socketClosed =
      session.ws.readyState === WebSocket.CLOSING || session.ws.readyState === WebSocket.CLOSED;

    if (expiredByChallenge || expiredByTtl || socketClosed) {
      if (
        session.ws.readyState === WebSocket.OPEN ||
        session.ws.readyState === WebSocket.CONNECTING
      ) {
        session.ws.close();
      }
      participantAuthSessions.delete(token);
    }
  }
}

function normalizePlayerStakes(players: PlayerStake[]): PlayerStake[] {
  const normalized = new Map<`0x${string}`, number>();

  for (const player of players) {
    const wallet = getAddress(player.wallet);
    if (!Number.isFinite(player.betAmount) || player.betAmount <= 0) {
      throw new Error(`Invalid bet amount for ${wallet}. Bet amount must be greater than 0.`);
    }

    normalized.set(wallet, player.betAmount);
  }

  return [...normalized.entries()].map(([wallet, betAmount]) => ({ wallet, betAmount }));
}

function amountToUnits(amount: number): number {
  return Math.round(amount * SIGNING_PRECISION);
}

function unitsToAmount(units: number): string {
  return (units / SIGNING_PRECISION).toFixed(6);
}

function unitsToTokenAmount(units: number, decimals: number): bigint {
  return (BigInt(units) * BigInt(10) ** BigInt(decimals)) / BigInt(SIGNING_PRECISION);
}

function toSigningMessage(payload: RequestPayload): `0x${string}` {
  return toHex(
    JSON.stringify(payload, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, nested) => (typeof nested === "bigint" ? nested.toString() : nested)),
  ) as T;
}

function serializeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack }
          : error.cause,
    };
  }

  return { value: error };
}

function logYellowError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  console.error(`[yellow] ${context}`, {
    ...serializeUnknownError(error),
    ...(extra ?? {}),
  });
}

async function openWebSocket(url: string): Promise<OpenWebSocket> {
  const ws = new WebSocket(url);

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      ws.close();
      reject(new Error(`Timed out connecting to Yellow WebSocket: ${url}`));
    }, MAX_TIMEOUT_MS);

    const onOpen = () => {
      cleanup();
      resolve(ws as OpenWebSocket);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeListener("open", onOpen);
      ws.removeListener("error", onError);
    };

    ws.on("open", onOpen);
    ws.on("error", onError);
  });
}

function extractRequestId(message: string): number | undefined {
  try {
    const parsed = JSON.parse(message) as { req?: unknown[] };
    const requestId = parsed.req?.[0];
    return typeof requestId === "number" ? requestId : undefined;
  } catch {
    return undefined;
  }
}

async function sendMessageAndWait(params: {
  ws: OpenWebSocket;
  message: string;
  expectedMethods: RPCMethod[];
}): Promise<RPCResponse> {
  const { ws, message, expectedMethods } = params;
  const expectedRequestId = extractRequestId(message);

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for methods: ${expectedMethods.join(", ")}`));
    }, MAX_TIMEOUT_MS);

    const onMessage = (data: WebSocket.RawData) => {
      const raw = data.toString();
      let response: RPCResponse;

      try {
        response = parseAnyRPCResponse(raw);
      } catch {
        return;
      }

      if (typeof expectedRequestId === "number" && response.requestId !== expectedRequestId) {
        return;
      }

      if (response.method === RPCMethod.Error) {
        console.error("[yellow] RPC error response", {
          expectedMethods,
          requestId: response.requestId,
          params: response.params,
          raw,
        });
        cleanup();
        reject(new Error(response.params.error));
        return;
      }

      if (!expectedMethods.includes(response.method)) {
        return;
      }

      cleanup();
      resolve(response);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Yellow WebSocket closed before response"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeListener("message", onMessage);
      ws.removeListener("error", onError);
      ws.removeListener("close", onClose);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);

    ws.send(message, (error) => {
      if (error) {
        cleanup();
        reject(error);
      }
    });
  });
}

async function withYellowConnection<T>(handler: (ws: OpenWebSocket) => Promise<T>): Promise<T> {
  const ws = await openWebSocket(getWsUrl());

  try {
    return await handler(ws);
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
}

async function authenticateWsWithParticipantJwt(
  ws: OpenWebSocket,
  jwtToken: string,
): Promise<void> {
  const verifyMessage = await createAuthVerifyMessageWithJWT(jwtToken);
  const verifyResponse = await sendMessageAndWait({
    ws,
    message: verifyMessage,
    expectedMethods: [RPCMethod.AuthVerify],
  });

  const params = verifyResponse.params as { success?: boolean };
  if (!params.success) {
    throw new Error("Participant JWT authentication failed");
  }
}

function matchAssetSymbol(symbol: string, assetId: string): boolean {
  const normalizedSymbol = symbol.trim().toLowerCase();
  const normalizedAsset = assetId.trim().toLowerCase();
  const normalizedAssetCompact = normalizedAsset.replace(/[._-]/g, "");

  const candidates = new Set([
    normalizedAsset,
    normalizedAssetCompact,
    "yusdc",
    "usdc",
    "ytestusd",
    "ytest.usd",
  ]);

  return candidates.has(normalizedSymbol) || candidates.has(normalizedSymbol.replace(/[._-]/g, ""));
}

async function fetchTokenMapping(ws: OpenWebSocket): Promise<YellowTokenCache> {
  const chainId = getBaseChainId();
  const assetId = getAssetId();

  const assetsMessage = createGetAssetsMessageV2(chainId);
  const assetsResponse = await sendMessageAndWait({
    ws,
    message: assetsMessage,
    expectedMethods: [RPCMethod.GetAssets, RPCMethod.Assets],
  });

  const assets = (assetsResponse.params as { assets: RPCAsset[] }).assets ?? [];
  const chainAssets = assets.filter((asset) => asset.chainId === chainId);

  const matched =
    chainAssets.find((asset) => matchAssetSymbol(asset.symbol, assetId)) ??
    (chainAssets.length === 1 ? chainAssets[0] : undefined);

  if (!matched) {
    const available = chainAssets.map((asset) => asset.symbol).join(", ") || "none";
    throw new Error(
      `Unable to map asset '${assetId}' on chain ${chainId}. Available symbols: ${available}`,
    );
  }

  return {
    tokenAddress: getAddress(matched.token),
    symbol: matched.symbol,
    decimals: matched.decimals,
    chainId,
    resolvedAt: Date.now(),
  };
}

async function getTokenMapping(forceRefresh = false): Promise<YellowTokenCache> {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }

  const tokenMapping = await withYellowConnection(async (ws) => fetchTokenMapping(ws));
  cachedToken = tokenMapping;
  return tokenMapping;
}

async function authenticateAdmin(
  ws: OpenWebSocket,
  existingSessionPrivateKey?: `0x${string}`,
): Promise<AdminAuthContext> {
  const privateKey = getAdminPrivateKey();
  const adminAccount = privateKeyToAccount(privateKey);
  const adminAddress = getAddress(adminAccount.address);
  const adminSessionPrivateKey = existingSessionPrivateKey ?? generatePrivateKey();
  const adminSessionAccount = privateKeyToAccount(adminSessionPrivateKey);
  const adminSessionSigner = createECDSAMessageSigner(adminSessionPrivateKey);

  const expiresAt = Math.floor(Date.now() / 1000 + AUTH_SESSION_SECONDS);
  const scope = `${getAppName()}.admin`;
  const allowances = [{ asset: getAssetId(), amount: getAuthAllowance() }];

  const authRequest = await createAuthRequestMessage({
    address: adminAddress,
    session_key: adminSessionAccount.address,
    application: getAppName(),
    allowances,
    expires_at: BigInt(expiresAt),
    scope,
  });

  const challengeResponse = await sendMessageAndWait({
    ws,
    message: authRequest,
    expectedMethods: [RPCMethod.AuthChallenge],
  });

  const challenge = (challengeResponse.params as { challengeMessage?: string }).challengeMessage;
  if (!challenge) {
    throw new Error("Yellow auth challenge message was not returned");
  }

  const walletClient = createWalletClient({
    account: adminAccount,
    chain: baseSepolia,
    transport: http(),
  });
  const eip712Signer = createEIP712AuthMessageSigner(
    walletClient,
    {
      scope,
      session_key: adminSessionAccount.address,
      expires_at: BigInt(expiresAt),
      allowances,
    },
    { name: getAppName() },
  );

  const authVerify = await createAuthVerifyMessage(
    eip712Signer,
    challengeResponse as AuthChallengeResponse,
  );

  const verifyResponse = await sendMessageAndWait({
    ws,
    message: authVerify,
    expectedMethods: [RPCMethod.AuthVerify],
  });

  const { success } = verifyResponse.params as { success: boolean };
  if (!success) {
    throw new Error("Admin auth_verify returned success=false");
  }

  return {
    adminAddress,
    adminSessionPrivateKey,
    adminSessionSigner,
  };
}

function buildStartAllocations(
  participants: `0x${string}`[],
  adminAddress: `0x${string}`,
  players: PlayerStake[],
): RPCAppSessionAllocation[] {
  const stakeMap = new Map(players.map((player) => [player.wallet, player.betAmount]));
  const asset = getAssetId();

  return participants.map((participant) => ({
    participant,
    asset,
    amount:
      participant === adminAddress
        ? "0.000000"
        : unitsToAmount(amountToUnits(stakeMap.get(participant) ?? 0)),
  }));
}

function buildCloseAllocations(
  participants: `0x${string}`[],
  adminAddress: `0x${string}`,
  players: PlayerStake[],
  winnersInput: `0x${string}`[],
): RPCAppSessionAllocation[] {
  const asset = getAssetId();
  const playerWallets = players.map((player) => player.wallet);
  const winnerCandidates =
    winnersInput.length === 0
      ? playerWallets
      : winnersInput.filter((winner) => playerWallets.includes(winner));
  const winners = winnerCandidates.length === 0 ? playerWallets : winnerCandidates;

  const payoutsByWallet = new Map<`0x${string}`, number>();
  for (const wallet of playerWallets) {
    payoutsByWallet.set(wallet, 0);
  }

  const payoutPlayers = players.filter((player) => winners.includes(player.wallet));
  const totalUnits = players.reduce((sum, player) => sum + amountToUnits(player.betAmount), 0);
  const totalWinnerWeight = payoutPlayers.reduce(
    (sum, player) => sum + amountToUnits(player.betAmount),
    0,
  );

  if (payoutPlayers.length > 0 && totalUnits > 0) {
    let distributed = 0;

    payoutPlayers.forEach((winner, index) => {
      let winnerUnits =
        totalWinnerWeight > 0
          ? Math.floor((totalUnits * amountToUnits(winner.betAmount)) / totalWinnerWeight)
          : Math.floor(totalUnits / payoutPlayers.length);

      if (index === payoutPlayers.length - 1) {
        winnerUnits = totalUnits - distributed;
      } else {
        distributed += winnerUnits;
      }

      payoutsByWallet.set(winner.wallet, winnerUnits);
    });
  }

  return participants.map((participant) => ({
    participant,
    asset,
    amount:
      participant === adminAddress
        ? "0.000000"
        : unitsToAmount(payoutsByWallet.get(participant) ?? 0),
  }));
}

function buildAppDefinition(participants: `0x${string}`[]): RPCAppDefinition {
  return {
    application: getAppName(),
    protocol: RPCProtocolVersion.NitroRPC_0_4,
    participants,
    weights: participants.map(() => 1),
    quorum: participants.length,
    challenge: 0,
    nonce: Date.now(),
  };
}

function randomActionId(): string {
  return `act_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
}

function cleanupExpiredWithdrawActions(): void {
  const now = Date.now();
  for (const [id, action] of withdrawOnchainActions.entries()) {
    if (action.createdAt + WITHDRAW_ACTION_TTL_MS <= now) {
      withdrawOnchainActions.delete(id);
    }
  }
}

function getChannelHintKey(wallet: `0x${string}`, tokenAddress: `0x${string}`, chainId: number): string {
  return `${wallet.toLowerCase()}::${tokenAddress.toLowerCase()}::${chainId}`;
}

function cleanupExpiredChannelHints(): void {
  const now = Date.now();
  for (const [key, hint] of createdChannelHints.entries()) {
    if (hint.createdAt + CHANNEL_HINT_TTL_MS <= now) {
      createdChannelHints.delete(key);
    }
  }
}

export interface WithdrawOnchainPrepareResult {
  actionId: string;
  flow: "withdraw" | "open_channel";
  requestPayloads: RequestPayload[];
  requestMethods: Array<RPCMethod.CreateChannel | RPCMethod.ResizeChannel>;
  amount: string;
  amountBaseUnits: string;
  tokenAddress: `0x${string}`;
  custodyAddress: `0x${string}`;
  channelCount: number;
  perChannelAmountsBaseUnits: string[];
}

export interface WithdrawOnchainExecutionResult {
  actionId: string;
  flow: "withdraw" | "open_channel";
  wallet: `0x${string}`;
  amount: string;
  amountBaseUnits: string;
  tokenAddress: `0x${string}`;
  custodyAddress: `0x${string}`;
  operations: Array<
    | {
        kind: "resize";
        amountBaseUnits: string;
        channelId: `0x${string}`;
        state: {
          intent: number;
          version: number;
          stateData: `0x${string}`;
          allocations: Array<{
            destination: `0x${string}`;
            token: `0x${string}`;
            amount: string;
          }>;
        };
        serverSignature: `0x${string}`;
        participantSignature: `0x${string}`;
      }
    | {
        kind: "create";
        amountBaseUnits: string;
        channelId: `0x${string}`;
        channel: {
          participants: `0x${string}`[];
          adjudicator: `0x${string}`;
          challenge: number;
          nonce: number;
        };
        state: {
          intent: number;
          version: number;
          stateData: `0x${string}`;
          allocations: Array<{
            destination: `0x${string}`;
            token: `0x${string}`;
            amount: string;
          }>;
        };
        serverSignature: `0x${string}`;
        participantSignature: `0x${string}`;
      }
  >;
}

export async function getPublicYellowConfig(): Promise<{
  chainId: number;
  assetId: string;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  adminWallet: `0x${string}`;
}> {
  const token = await getTokenMapping();

  return {
    chainId: token.chainId,
    assetId: getAssetId(),
    tokenAddress: token.tokenAddress,
    tokenSymbol: process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? token.symbol,
    adminWallet: getAdminAddress(),
  };
}

export async function getUnifiedYellowBalance(walletInput: string): Promise<{
  wallet: `0x${string}`;
  asset: string;
  amount: string;
}> {
  const wallet = getAddress(walletInput);
  const cacheKey = wallet.toLowerCase();
  const cached = unifiedBalanceCache.get(cacheKey);

  if (cached && Date.now() - cached.resolvedAt < UNIFIED_BALANCE_CACHE_TTL_MS) {
    return {
      wallet: cached.wallet,
      asset: cached.asset,
      amount: cached.amount,
    };
  }

  try {
    const token = await getTokenMapping();
    const targetAsset = getAssetId();
    const targetAssetLower = targetAsset.toLowerCase();

    return await withYellowConnection(async (ws) => {
      let offset = 0;
      let pages = 0;
      let netAmount = BigInt(0);
      const walletLower = wallet.toLowerCase();

      while (pages < UNIFIED_BALANCE_MAX_PAGES) {
        const queryMessage = createGetLedgerTransactionsMessageV2(wallet, {
          asset: targetAsset,
          sort: "desc",
          offset,
          limit: UNIFIED_BALANCE_PAGE_LIMIT,
        });

        const txResponse = await sendMessageAndWait({
          ws,
          message: queryMessage,
          expectedMethods: [RPCMethod.GetLedgerTransactions],
        });

        const transactions =
          (txResponse.params as {
            ledgerTransactions?: Array<{ fromAccount: string; toAccount: string; amount: string; asset: string }>;
          }).ledgerTransactions ?? [];

        if (transactions.length === 0) {
          break;
        }

        for (const tx of transactions) {
          if (tx.asset.toLowerCase() !== targetAssetLower) {
            continue;
          }

          let parsedAmount: bigint;
          try {
            parsedAmount = parseUnits(String(tx.amount), token.decimals);
          } catch {
            continue;
          }

          const fromAccount = String(tx.fromAccount ?? "").toLowerCase();
          const toAccount = String(tx.toAccount ?? "").toLowerCase();

          if (toAccount === walletLower) {
            netAmount += parsedAmount;
          }
          if (fromAccount === walletLower) {
            netAmount -= parsedAmount;
          }
        }

        pages += 1;
        if (transactions.length < UNIFIED_BALANCE_PAGE_LIMIT) {
          break;
        }
        offset += transactions.length;
      }

      const amount = formatUnits(netAmount, token.decimals);
      const result = {
        wallet,
        asset: targetAsset,
        amount,
      };

      unifiedBalanceCache.set(cacheKey, {
        ...result,
        resolvedAt: Date.now(),
      });

      return result;
    });
  } catch (error) {
    logYellowError("getUnifiedYellowBalance failed", error, { wallet });
    throw error;
  }
}

export async function assertPlayersCanCoverLosses(players: LobbyPlayer[]): Promise<void> {
  const normalized = normalizePlayerStakes(players);
  if (normalized.length === 0) {
    return;
  }

  const token = await getTokenMapping();
  const adminAddress = getAdminAddress();
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const decimals = Number(
    await publicClient.readContract({
      address: token.tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  );

  const missingAllowance: string[] = [];
  const insufficientBalance: string[] = [];

  await Promise.all(
    normalized.map(async (player) => {
      const required = unitsToTokenAmount(amountToUnits(player.betAmount), decimals);
      const [allowance, balance] = await Promise.all([
        publicClient.readContract({
          address: token.tokenAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [player.wallet, adminAddress],
        }),
        publicClient.readContract({
          address: token.tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [player.wallet],
        }),
      ]);

      if (allowance < required) {
        missingAllowance.push(
          `${player.wallet} (allowance ${formatUnits(allowance, decimals)}, required ${formatUnits(required, decimals)})`,
        );
      }
      if (balance < required) {
        insufficientBalance.push(
          `${player.wallet} (balance ${formatUnits(balance, decimals)}, required ${formatUnits(required, decimals)})`,
        );
      }
    }),
  );

  if (missingAllowance.length === 0 && insufficientBalance.length === 0) {
    return;
  }

  const segments: string[] = [];
  if (missingAllowance.length > 0) {
    segments.push(`missing allowance to admin ${adminAddress}: ${missingAllowance.join("; ")}`);
  }
  if (insufficientBalance.length > 0) {
    segments.push(`insufficient token balance: ${insufficientBalance.join("; ")}`);
  }

  // TEMPORARILY DISABLED: Player funding precheck
  console.warn(`[WARN] Player funding precheck would have failed: ${segments.join(" | ")}`);
  // throw new Error(`Player funding precheck failed (${segments.join(" | ")}).`);
}

export async function prepareUnifiedWithdrawToOnchain(params: {
  wallet: string;
  amount: string;
  authJwtToken?: string;
  allowCreateIfMissing?: boolean;
}): Promise<WithdrawOnchainPrepareResult> {
  cleanupExpiredWithdrawActions();

  const wallet = getAddress(params.wallet);
  const token = await getTokenMapping();
  const amountInput = params.amount.trim();
  const amountBaseUnits = parseUnits(amountInput, token.decimals);
  const allowCreateIfMissing = params.allowCreateIfMissing ?? true;

  if (amountBaseUnits <= BigInt(0)) {
    throw new Error("Withdraw amount must be greater than 0.");
  }

  try {
    return await withYellowConnection(async (ws) => {
    if (!params.authJwtToken) {
      throw new Error("Participant authentication required. Re-authorize wallet and try again.");
    }
    await authenticateWsWithParticipantJwt(ws, params.authJwtToken);

    const configResponse = await sendMessageAndWait({
      ws,
      message: createGetConfigMessageV2(),
      expectedMethods: [RPCMethod.GetConfig],
    });

    const networks =
      (configResponse.params as { networks?: Array<{ chainId: number; custodyAddress: string }> })
        .networks ?? [];
    const targetNetwork = networks.find((network) => network.chainId === getBaseChainId());
    if (!targetNetwork) {
      throw new Error(`Yellow config missing network ${getBaseChainId()}.`);
    }

    const getCandidateChannels = async (): Promise<
      Array<{
        channelId: `0x${string}`;
        participant: `0x${string}`;
        token: `0x${string}`;
        chainId: number;
        amount: bigint;
        wallet: `0x${string}`;
      }>
    > => {
      const queries: Array<{
        participant?: `0x${string}`;
        status: RPCChannelStatus;
      }> = [
        { participant: wallet, status: RPCChannelStatus.Open },
        { participant: wallet, status: RPCChannelStatus.Resizing },
        { status: RPCChannelStatus.Open },
        { status: RPCChannelStatus.Resizing },
      ];

      const merged = new Map<
        `0x${string}`,
        {
          channelId: `0x${string}`;
          participant: `0x${string}`;
          token: `0x${string}`;
          chainId: number;
          amount: bigint;
          wallet: `0x${string}`;
        }
      >();

      for (const query of queries) {
        const channelsResponse = await sendMessageAndWait({
          ws,
          message: createGetChannelsMessageV2(query.participant, query.status),
          expectedMethods: [RPCMethod.GetChannels],
        });

        const channels =
          (channelsResponse.params as {
            channels?: Array<{
              channelId: `0x${string}`;
              participant: `0x${string}`;
              token: `0x${string}`;
              chainId: number;
              amount: bigint;
              wallet: `0x${string}`;
            }>;
          }).channels ?? [];

        for (const channel of channels) {
          if (!merged.has(channel.channelId)) {
            merged.set(channel.channelId, channel);
          }
        }
      }

      return [...merged.values()]
        .filter(
          (entry) =>
            entry.chainId === getBaseChainId() &&
            (getAddress(entry.wallet) === wallet || getAddress(entry.participant) === wallet) &&
            getAddress(entry.token) === token.tokenAddress,
        )
        .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));
    };

    let candidateChannels = await getCandidateChannels();

    const requestPayloads: RequestPayload[] = [];
    const requestMethods: Array<RPCMethod.CreateChannel | RPCMethod.ResizeChannel> = [];
    const requestPayloadsJsonSafe: RequestPayload[] = [];
    const perChannelAmountsBaseUnits: string[] = [];
    let flow: "withdraw" | "open_channel" = "withdraw";

    if (candidateChannels.length === 0) {
      // Check if a channel was recently created (hint exists)
      cleanupExpiredChannelHints();
      const hintKey = getChannelHintKey(wallet, token.tokenAddress, getBaseChainId());
      const hasRecentChannelHint = createdChannelHints.has(hintKey);
      
      console.log("[yellow] no channels found initially", {
        wallet,
        asset: getAssetId(),
        chainId: getBaseChainId(),
        hasRecentChannelHint,
        allowCreateIfMissing,
      });
      
      // If a hint exists, wait for the channel to be indexed (even if allowCreateIfMissing is true)
      if (hasRecentChannelHint) {
        console.log("[yellow] channel hint found, polling for indexed channel...");
        const maxAttempts = CHANNEL_INDEXING_MAX_ATTEMPTS + 30;  // 75 seconds for recently created channels (20+30=50 attempts × 1.5s)
        
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, CHANNEL_INDEXING_POLL_MS));
          candidateChannels = await getCandidateChannels();
          if (candidateChannels.length > 0) {
            console.log("[yellow] channel found after polling", {
              attempt: attempt + 1,
              channelCount: candidateChannels.length,
            });
            break;
          }
        }

        if (candidateChannels.length === 0) {
          console.error("[yellow] channel indexing poll exhausted", {
            wallet,
            asset: getAssetId(),
            chainId: getBaseChainId(),
            attempts: maxAttempts,
            pollMs: CHANNEL_INDEXING_POLL_MS,
            totalWaitSeconds: (maxAttempts * CHANNEL_INDEXING_POLL_MS) / 1000,
            hadRecentHint: hasRecentChannelHint,
          });
          
          if (allowCreateIfMissing) {
            console.log("[yellow] polling exhausted but allowCreateIfMissing=true, will create new channel");
            // Clear the stale hint since we're creating a fresh channel
            createdChannelHints.delete(hintKey);
          } else {
            throw new Error(
              `Your ${getAssetId()} channel is still being indexed. This can take up to 60 seconds after creation. Please wait a moment and try again.`,
            );
          }
        }
      } else if (!allowCreateIfMissing) {
        // No hint and not allowed to create - fail immediately
        throw new Error(
          `No ${getAssetId()} channel exists for this wallet. Please deposit funds first to create a channel, or allow automatic channel creation.`,
        );
      }
    }

    if (candidateChannels.length === 0) {
      const createRequest = NitroliteRPC.createRequest({
        method: RPCMethod.CreateChannel,
        params: {
          chain_id: getBaseChainId(),
          token: token.tokenAddress,
        },
      });
      const createPayload = createRequest.req as RequestPayload;
      requestPayloads.push(createPayload);
      requestMethods.push(RPCMethod.CreateChannel);
      requestPayloadsJsonSafe.push(toJsonSafe(createPayload));
      perChannelAmountsBaseUnits.push("0");
      flow = "open_channel";

      // Set a hint that channel creation is pending/in-progress
      // This helps subsequent withdrawal attempts know to wait for indexing
      const hintKey = getChannelHintKey(wallet, token.tokenAddress, getBaseChainId());
      createdChannelHints.set(hintKey, {
        channelId: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`, // Placeholder until actual ID known
        wallet,
        tokenAddress: token.tokenAddress,
        chainId: getBaseChainId(),
        createdAt: Date.now(),
      });

      const actionId = randomActionId();
      withdrawOnchainActions.set(actionId, {
        id: actionId,
        wallet,
        flow,
        amount: amountInput,
        amountBaseUnits: amountBaseUnits.toString(),
        tokenAddress: token.tokenAddress,
        custodyAddress: getAddress(targetNetwork.custodyAddress),
        requestPayloads,
        requestMethods,
        perChannelAmountsBaseUnits,
        createdAt: Date.now(),
      });

      return {
        actionId,
        flow,
        requestPayloads: requestPayloadsJsonSafe,
        requestMethods,
        amount: amountInput,
        amountBaseUnits: amountBaseUnits.toString(),
        tokenAddress: token.tokenAddress,
        custodyAddress: getAddress(targetNetwork.custodyAddress),
        channelCount: requestPayloads.length,
        perChannelAmountsBaseUnits,
      };
    }

    let remaining = amountBaseUnits;
    const channelAmounts = new Map<`0x${string}`, bigint>(
      candidateChannels.map((channel) => [channel.channelId, channel.amount]),
    );
    const totalChannelLiquidity = candidateChannels.reduce((sum, entry) => sum + entry.amount, BigInt(0));
    const requiredUnifiedTopUp =
      totalChannelLiquidity >= amountBaseUnits ? BigInt(0) : amountBaseUnits - totalChannelLiquidity;

    if (requiredUnifiedTopUp > BigInt(0)) {
      // Bootstrap channel liquidity from unified balance into one open channel.
      const topUpChannel = candidateChannels[0];
      const topUpRequest = NitroliteRPC.createRequest({
        method: RPCMethod.ResizeChannel,
        params: {
          channel_id: topUpChannel.channelId,
          allocate_amount: requiredUnifiedTopUp,
          funds_destination: wallet,
        },
      });

      const topUpPayload = topUpRequest.req as RequestPayload;
      requestPayloads.push(topUpPayload);
      requestMethods.push(RPCMethod.ResizeChannel);
      requestPayloadsJsonSafe.push(toJsonSafe(topUpPayload));
      perChannelAmountsBaseUnits.push(requiredUnifiedTopUp.toString());
      channelAmounts.set(topUpChannel.channelId, (channelAmounts.get(topUpChannel.channelId) ?? BigInt(0)) + requiredUnifiedTopUp);
    }

    for (const channel of candidateChannels) {
      if (remaining <= BigInt(0)) {
        break;
      }

      const available = channelAmounts.get(channel.channelId) ?? BigInt(0);
      if (available <= BigInt(0)) {
        continue;
      }

      const takeAmount = available < remaining ? available : remaining;
      const request = NitroliteRPC.createRequest({
        method: RPCMethod.ResizeChannel,
        params: {
          channel_id: channel.channelId,
          resize_amount: -takeAmount,
          funds_destination: wallet,
        },
      });

      const requestPayload = request.req as RequestPayload;
      requestPayloads.push(requestPayload);
      requestMethods.push(RPCMethod.ResizeChannel);
      requestPayloadsJsonSafe.push(toJsonSafe(requestPayload));
      perChannelAmountsBaseUnits.push(takeAmount.toString());
      remaining -= takeAmount;
    }

    if (remaining > BigInt(0)) {
      const availableAfterTopUp = amountBaseUnits - remaining;
      throw new Error(
        `Insufficient open-channel liquidity for ${getAssetId()}. Requested ${amountInput}, available ${formatUnits(availableAfterTopUp, token.decimals)}.`,
      );
    }

    const actionId = randomActionId();
    withdrawOnchainActions.set(actionId, {
      id: actionId,
      wallet,
      flow,
      amount: amountInput,
      amountBaseUnits: amountBaseUnits.toString(),
      tokenAddress: token.tokenAddress,
      custodyAddress: getAddress(targetNetwork.custodyAddress),
      requestPayloads,
      requestMethods,
      perChannelAmountsBaseUnits,
      createdAt: Date.now(),
    });

    return {
      actionId,
      flow,
      requestPayloads: requestPayloadsJsonSafe,
      requestMethods,
      amount: amountInput,
      amountBaseUnits: amountBaseUnits.toString(),
      tokenAddress: token.tokenAddress,
      custodyAddress: getAddress(targetNetwork.custodyAddress),
      channelCount: requestPayloads.length,
      perChannelAmountsBaseUnits,
    };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("authentication required")) {
      throw new Error("Participant authentication required. Re-authorize wallet and try again.");
    }
    throw error;
  }
}

export async function executeUnifiedWithdrawToOnchain(params: {
  actionId: string;
  wallet: string;
  sessionKey: string;
  authJwtToken?: string;
  preparedAction?: {
    wallet: string;
    flow: "withdraw" | "open_channel";
    amount: string;
    amountBaseUnits: string;
    tokenAddress: string;
    custodyAddress: string;
    requestPayloads: RequestPayload[];
    requestMethods?: Array<"create_channel" | "resize_channel">;
    perChannelAmountsBaseUnits: string[];
  };
  signature?: `0x${string}`;
  signatures?: `0x${string}`[];
}): Promise<WithdrawOnchainExecutionResult> {
  cleanupExpiredWithdrawActions();

  const wallet = getAddress(params.wallet);
  const sessionKey = getAddress(params.sessionKey);
  let action = withdrawOnchainActions.get(params.actionId);

  if (!action || action.wallet !== wallet) {
    const prepared = params.preparedAction;
    if (!prepared) {
      throw new Error("Withdraw action not found or does not match wallet.");
    }

    const preparedWallet = getAddress(prepared.wallet);
    if (preparedWallet !== wallet) {
      throw new Error("Prepared withdraw action wallet does not match connected wallet.");
    }

    if (!Array.isArray(prepared.requestPayloads) || prepared.requestPayloads.length === 0) {
      throw new Error("Prepared withdraw action has no request payloads.");
    }
    if (
      !Array.isArray(prepared.perChannelAmountsBaseUnits) ||
      prepared.perChannelAmountsBaseUnits.length !== prepared.requestPayloads.length
    ) {
      throw new Error("Prepared withdraw action amount segments are invalid.");
    }

    const normalizedMethods: Array<RPCMethod.CreateChannel | RPCMethod.ResizeChannel> =
      Array.isArray(prepared.requestMethods) &&
      prepared.requestMethods.length === prepared.requestPayloads.length
        ? prepared.requestMethods.map((method) =>
            method === RPCMethod.CreateChannel ? RPCMethod.CreateChannel : RPCMethod.ResizeChannel,
          )
        : prepared.requestPayloads.map(() => RPCMethod.ResizeChannel as RPCMethod.ResizeChannel);

    action = {
      id: params.actionId,
      wallet,
      flow: prepared.flow,
      amount: prepared.amount,
      amountBaseUnits: prepared.amountBaseUnits,
      tokenAddress: getAddress(prepared.tokenAddress),
      custodyAddress: getAddress(prepared.custodyAddress),
      requestPayloads: prepared.requestPayloads,
      requestMethods: normalizedMethods,
      perChannelAmountsBaseUnits: [...prepared.perChannelAmountsBaseUnits],
      createdAt: Date.now(),
    };
  }

  if (!action) {
    throw new Error("Withdraw action not found.");
  }

  const signatures =
    Array.isArray(params.signatures) && params.signatures.length > 0
      ? params.signatures
      : params.signature
        ? [params.signature]
        : [];

  if (signatures.length !== action.requestPayloads.length) {
    throw new Error(
      `Expected ${action.requestPayloads.length} withdraw signature(s), received ${signatures.length}.`,
    );
  }

  for (let index = 0; index < action.requestPayloads.length; index += 1) {
    const signatureValid = await verifySessionSignature({
      sessionKey,
      requestPayload: action.requestPayloads[index],
      signature: signatures[index],
    });
    if (!signatureValid) {
      throw new Error(`Invalid session-key signature for withdraw action segment ${index + 1}.`);
    }
  }

  try {
    const operations = await withYellowConnection(async (ws) => {
      if (!params.authJwtToken) {
        throw new Error("Participant authentication required. Re-authorize wallet and try again.");
      }
      await authenticateWsWithParticipantJwt(ws, params.authJwtToken);

      const results: WithdrawOnchainExecutionResult["operations"] = [];

      for (let index = 0; index < action.requestPayloads.length; index += 1) {
        const expectedMethod = action.requestMethods[index] ?? RPCMethod.ResizeChannel;
        const response = await sendMessageAndWait({
          ws,
          message: JSON.stringify(
            {
              req: action.requestPayloads[index],
              sig: [signatures[index]],
            },
            (_, nested) => (typeof nested === "bigint" ? nested.toString() : nested),
          ),
          expectedMethods: [expectedMethod],
        });

        if (expectedMethod === RPCMethod.CreateChannel) {
          const created = response.params as {
            channelId: `0x${string}`;
            channel: {
              participants: `0x${string}`[];
              adjudicator: `0x${string}`;
              challenge: number;
              nonce: number;
            };
            state: {
              intent: number;
              version: number;
              stateData: `0x${string}`;
              allocations: Array<{
                destination: `0x${string}`;
                token: `0x${string}`;
                amount: bigint;
              }>;
            };
            serverSignature: `0x${string}`;
          };

          results.push({
            kind: "create",
            amountBaseUnits: action.perChannelAmountsBaseUnits[index] ?? "0",
            channelId: created.channelId,
            channel: {
              participants: created.channel.participants.map((participant) => getAddress(participant)),
              adjudicator: getAddress(created.channel.adjudicator),
              challenge: created.channel.challenge,
              nonce: created.channel.nonce,
            },
            state: {
              intent: created.state.intent,
              version: created.state.version,
              stateData: created.state.stateData,
              allocations: created.state.allocations.map((allocation) => ({
                destination: allocation.destination,
                token: allocation.token,
                amount: allocation.amount.toString(),
              })),
            },
            serverSignature: created.serverSignature,
            participantSignature: signatures[index],
          });
          
          // Store hint that channel was just created (for indexing polling)
          const hintKey = getChannelHintKey(wallet, action.tokenAddress, getBaseChainId());
          createdChannelHints.set(hintKey, {
            channelId: created.channelId,
            wallet,
            tokenAddress: action.tokenAddress,
            chainId: getBaseChainId(),
            createdAt: Date.now(),
          });
          
          continue;
        }

        const resize = response.params as {
          channelId: `0x${string}`;
          state: {
            intent: number;
            version: number;
            stateData: `0x${string}`;
            allocations: Array<{
              destination: `0x${string}`;
              token: `0x${string}`;
              amount: bigint;
            }>;
          };
          serverSignature: `0x${string}`;
        };

        results.push({
          kind: "resize",
          amountBaseUnits: action.perChannelAmountsBaseUnits[index] ?? "0",
          channelId: resize.channelId,
          state: {
            intent: resize.state.intent,
            version: resize.state.version,
            stateData: resize.state.stateData,
            allocations: resize.state.allocations.map((allocation) => ({
              destination: allocation.destination,
              token: allocation.token,
              amount: allocation.amount.toString(),
            })),
          },
          serverSignature: resize.serverSignature,
          participantSignature: signatures[index],
        });
      }

      return results;
    });

    withdrawOnchainActions.delete(params.actionId);

    return {
      actionId: action.id,
      flow: action.flow,
      wallet: action.wallet,
      amount: action.amount,
      amountBaseUnits: action.amountBaseUnits,
      tokenAddress: action.tokenAddress,
      custodyAddress: action.custodyAddress,
      operations,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("authentication required")) {
      throw new Error("Participant authentication required. Re-authorize wallet and try again.");
    }
    if (message.includes("invalid message timestamp")) {
      withdrawOnchainActions.delete(params.actionId);
      throw new Error("Withdraw action expired on Yellow timestamp window. Retry withdrawal.");
    }
    throw error;
  }
}

export async function requestParticipantAuthChallenge(params: {
  wallet: string;
  sessionKey: string;
}): Promise<ParticipantAuthChallenge> {
  cleanupExpiredParticipantAuthSessions();

  const wallet = getAddress(params.wallet);
  const sessionKey = getAddress(params.sessionKey);
  const scope = `${getAppName()}.player`;
  // Challenge state is short-lived, but the authorized session key should remain usable longer.
  const expiresAt = Math.floor(Date.now() / 1000 + AUTH_SESSION_SECONDS);
  const allowances = [{ asset: getAssetId(), amount: getAuthAllowance() }];
  const ws = await openWebSocket(getWsUrl());
  let keepAlive = false;

  try {
    const authRequest = await createAuthRequestMessage({
      address: wallet,
      session_key: sessionKey,
      application: getAppName(),
      allowances,
      expires_at: BigInt(expiresAt),
      scope,
    });

    const challengeResponse = await sendMessageAndWait({
      ws,
      message: authRequest,
      expectedMethods: [RPCMethod.AuthRequest, RPCMethod.AuthChallenge],
    });

    const challenge = (challengeResponse.params as { challengeMessage?: string }).challengeMessage;
    if (!challenge) {
      throw new Error("Yellow auth challenge message missing");
    }

    const authToken = randomAuthToken();
    participantAuthSessions.set(authToken, {
      authToken,
      wallet,
      sessionKey,
      challenge,
      expiresAt,
      scope,
      appName: getAppName(),
      allowances,
      ws,
      createdAt: Date.now(),
    });

    keepAlive = true;

    return {
      authToken,
      challenge,
      expiresAt,
      scope,
      appName: getAppName(),
      allowances,
    };
  } catch (error) {
    logYellowError("requestParticipantAuthChallenge failed", error, {
      wallet,
      sessionKey,
      scope,
    });
    throw error;
  } finally {
    if (
      !keepAlive &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close();
    }
  }
}

export async function verifyParticipantAuthSignature(params: {
  authToken?: string;
  wallet: string;
  sessionKey: string;
  challenge: string;
  signature: `0x${string}`;
  expiresAt?: number;
  scope?: string;
  appName?: string;
}): Promise<ParticipantAuthVerification> {
  cleanupExpiredParticipantAuthSessions();

  const wallet = getAddress(params.wallet);
  const sessionKey = getAddress(params.sessionKey);
  const challengeState =
    typeof params.authToken === "string" && params.authToken.length > 0
      ? participantAuthSessions.get(params.authToken)
      : undefined;

  if (!challengeState) {
    // Fallback mode for dev/hot-reload/server-instance churn: verify against Yellow without cached WS state.
    let jwtToken: string | undefined;
    try {
      await withYellowConnection(async (ws) => {
        const authVerifyMessage = await createAuthVerifyMessageFromChallenge(
          async () => params.signature,
          params.challenge,
        );

        const verifyResponse = await sendMessageAndWait({
          ws,
          message: authVerifyMessage,
          expectedMethods: [RPCMethod.AuthVerify],
        });

        const responseParams = verifyResponse.params as {
          success: boolean;
          address?: string;
          sessionKey?: string;
          jwtToken?: string;
        };

        if (!responseParams.success) {
          throw new Error("Participant auth_verify returned success=false");
        }

        if (responseParams.address && getAddress(responseParams.address) !== wallet) {
          throw new Error("Auth verify wallet mismatch");
        }

        if (responseParams.sessionKey && getAddress(responseParams.sessionKey) !== sessionKey) {
          throw new Error("Auth verify session key mismatch");
        }

        if (typeof responseParams.jwtToken === "string" && responseParams.jwtToken.length > 0) {
          jwtToken = responseParams.jwtToken;
        }
      });
    } catch (error) {
      logYellowError("verifyParticipantAuthSignature fallback failed", error, {
        wallet,
        sessionKey,
        challenge: params.challenge,
      });
      throw error;
    }

    return {
      expiresAt:
        typeof params.expiresAt === "number" && Number.isFinite(params.expiresAt)
          ? Math.floor(params.expiresAt)
          : Math.floor(Date.now() / 1000 + AUTH_CHALLENGE_SESSION_TTL_SECONDS),
      scope: params.scope ?? `${getAppName()}.player`,
      appName: params.appName ?? getAppName(),
      jwtToken,
    };
  }

  const authToken = challengeState.authToken;

  if (challengeState.wallet !== wallet || challengeState.sessionKey !== sessionKey) {
    participantAuthSessions.delete(authToken);
    if (
      challengeState.ws.readyState === WebSocket.OPEN ||
      challengeState.ws.readyState === WebSocket.CONNECTING
    ) {
      challengeState.ws.close();
    }
    throw new Error("Auth session does not match wallet/session key.");
  }

  if (challengeState.challenge !== params.challenge) {
    participantAuthSessions.delete(authToken);
    if (
      challengeState.ws.readyState === WebSocket.OPEN ||
      challengeState.ws.readyState === WebSocket.CONNECTING
    ) {
      challengeState.ws.close();
    }
    throw new Error("Auth challenge mismatch. Request a new challenge and sign again.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (challengeState.expiresAt <= now) {
    participantAuthSessions.delete(authToken);
    if (
      challengeState.ws.readyState === WebSocket.OPEN ||
      challengeState.ws.readyState === WebSocket.CONNECTING
    ) {
      challengeState.ws.close();
    }
    throw new Error("Auth challenge expired. Request a new challenge and sign again.");
  }

  let jwtToken: string | undefined;
  try {
    const authVerifyMessage = await createAuthVerifyMessageFromChallenge(
      async () => params.signature,
      params.challenge,
    );

    const verifyResponse = await sendMessageAndWait({
      ws: challengeState.ws,
      message: authVerifyMessage,
      expectedMethods: [RPCMethod.AuthVerify],
    });

    const responseParams = verifyResponse.params as {
      success: boolean;
      address?: string;
      sessionKey?: string;
      jwtToken?: string;
    };

    if (!responseParams.success) {
      throw new Error("Participant auth_verify returned success=false");
    }

    if (responseParams.address && getAddress(responseParams.address) !== wallet) {
      throw new Error("Auth verify wallet mismatch");
    }

    if (responseParams.sessionKey && getAddress(responseParams.sessionKey) !== sessionKey) {
      throw new Error("Auth verify session key mismatch");
    }

    if (typeof responseParams.jwtToken === "string" && responseParams.jwtToken.length > 0) {
      jwtToken = responseParams.jwtToken;
    }
  } catch (error) {
    logYellowError("verifyParticipantAuthSignature stateful failed", error, {
      wallet,
      sessionKey,
      challenge: params.challenge,
      authToken,
    });
    throw error;
  } finally {
    participantAuthSessions.delete(authToken);
    if (
      challengeState.ws.readyState === WebSocket.OPEN ||
      challengeState.ws.readyState === WebSocket.CONNECTING
    ) {
      challengeState.ws.close();
    }
  }

  return {
    expiresAt: challengeState.expiresAt,
    scope: challengeState.scope,
    appName: challengeState.appName,
    jwtToken,
  };
}

export async function verifySessionSignature(params: {
  sessionKey: string;
  requestPayload: RequestPayload;
  signature: `0x${string}`;
}): Promise<boolean> {
  const expectedSessionKey = getAddress(params.sessionKey);
  const message = toSigningMessage(params.requestPayload);
  const recovered = await recoverAddress({
    hash: keccak256(message),
    signature: params.signature,
  });

  return getAddress(recovered) === expectedSessionKey;
}

export async function buildStartPendingAction(params: {
  players: LobbyPlayer[];
  winners: `0x${string}`[];
  crashMultiplier: number;
}): Promise<PendingActionInternal> {
  const players = normalizePlayerStakes(params.players);
  const playerWallets = players.map((player) => player.wallet);

  if (playerWallets.length < 1) {
    throw new Error("At least 1 participant is required to start");
  }

  const token = await getTokenMapping();

  return await withYellowConnection(async (ws) => {
    const admin = await authenticateAdmin(ws);
    const participants = [admin.adminAddress, ...playerWallets] as `0x${string}`[];
    const definition = buildAppDefinition(participants);
    const allocations = buildStartAllocations(participants, admin.adminAddress, players);
    const totalBetAmount = players.reduce((sum, player) => sum + player.betAmount, 0);

    const request = NitroliteRPC.createRequest({
      method: RPCMethod.CreateAppSession,
      params: {
        definition,
        allocations,
        session_data: JSON.stringify({
          status: "started",
          app: getAppName(),
          startedAt: new Date().toISOString(),
          totalBetAmount: unitsToAmount(amountToUnits(totalBetAmount)),
        }),
      },
    });

    const requestPayload = request.req as RequestPayload;
    const adminSignature = await admin.adminSessionSigner(
      requestPayload as Parameters<ReturnType<typeof createECDSAMessageSigner>>[0],
    );

    const meta: StartActionMeta = {
      type: "start",
      players: params.players,
      winners: [...params.winners],
      crashMultiplier: params.crashMultiplier,
      tokenAddress: token.tokenAddress,
      adminSessionPrivateKey: admin.adminSessionPrivateKey,
    };

    return {
      id: randomActionId(),
      type: "start",
      method: RPCMethod.CreateAppSession,
      requestPayload,
      requiredWallets: participants,
      signaturesByWallet: {
        [admin.adminAddress]: adminSignature,
      } as Record<`0x${string}`, `0x${string}`>,
      createdAt: new Date().toISOString(),
      meta,
    };
  });
}

export async function buildClosePendingAction(params: {
  appSessionId: `0x${string}`;
  players: LobbyPlayer[];
  winners: `0x${string}`[];
  crashMultiplier: number;
  tokenAddress: `0x${string}`;
}): Promise<PendingActionInternal> {
  const players = normalizePlayerStakes(params.players);

  return await withYellowConnection(async (ws) => {
    const admin = await authenticateAdmin(ws);
    const participants = [admin.adminAddress, ...players.map((player) => player.wallet)] as `0x${string}`[];
    const allocations = buildCloseAllocations(participants, admin.adminAddress, players, params.winners);

    const request = NitroliteRPC.createRequest({
      method: RPCMethod.CloseAppSession,
      params: {
        app_session_id: params.appSessionId,
        allocations,
        session_data: JSON.stringify({
          status: "ended",
          endedAt: new Date().toISOString(),
          crashMultiplier: params.crashMultiplier,
          winners: params.winners,
          totalBetAmount: unitsToAmount(
            players.reduce((sum, player) => sum + amountToUnits(player.betAmount), 0),
          ),
        }),
      },
    });

    const requestPayload = request.req as RequestPayload;
    const adminSignature = await admin.adminSessionSigner(
      requestPayload as Parameters<ReturnType<typeof createECDSAMessageSigner>>[0],
    );

    const meta: CloseActionMeta = {
      type: "close",
      appSessionId: params.appSessionId,
      players: params.players,
      winners: [...params.winners],
      crashMultiplier: params.crashMultiplier,
      tokenAddress: params.tokenAddress,
      adminSessionPrivateKey: admin.adminSessionPrivateKey,
    };

    return {
      id: randomActionId(),
      type: "close",
      method: RPCMethod.CloseAppSession,
      requestPayload,
      requiredWallets: participants,
      signaturesByWallet: {
        [admin.adminAddress]: adminSignature,
      } as Record<`0x${string}`, `0x${string}`>,
      createdAt: new Date().toISOString(),
      meta,
    };
  });
}

async function submitSignedAction(action: PendingActionInternal): Promise<RPCResponse> {
  const orderedSignatures = action.requiredWallets.map((wallet) => {
    const signature = action.signaturesByWallet[wallet];
    if (!signature) {
      throw new Error(`Missing signature from required wallet ${wallet}`);
    }
    return signature;
  });

  return await withYellowConnection(async (ws) => {
    await authenticateAdmin(ws, action.meta.adminSessionPrivateKey);

    return await sendMessageAndWait({
      ws,
      message: JSON.stringify({
        req: action.requestPayload,
        sig: orderedSignatures,
      }),
      expectedMethods:
        action.type === "start" ? [RPCMethod.CreateAppSession] : [RPCMethod.CloseAppSession],
    });
  });
}

function computeWinnerWalletSet(
  normalizedPlayers: PlayerStake[],
  winnersInput: `0x${string}`[],
): Set<`0x${string}`> {
  const playerWallets = normalizedPlayers.map((player) => player.wallet);
  const winnerCandidates =
    winnersInput.length === 0
      ? playerWallets
      : winnersInput.filter((winner) => playerWallets.includes(winner));
  const winners = winnerCandidates.length === 0 ? playerWallets : winnerCandidates;
  return new Set(winners);
}

function computePayoutsForOnchain(players: LobbyPlayer[], winnersInput: `0x${string}`[]): Map<`0x${string}`, number> {
  const normalizedPlayers = normalizePlayerStakes(players);
  const winners = computeWinnerWalletSet(normalizedPlayers, winnersInput);
  const payoutPlayers = normalizedPlayers.filter((player) => winners.has(player.wallet));
  const loserPoolUnits = normalizedPlayers
    .filter((player) => !winners.has(player.wallet))
    .reduce((sum, player) => sum + amountToUnits(player.betAmount), 0);
  const totalWinnerWeight = payoutPlayers.reduce(
    (sum, player) => sum + amountToUnits(player.betAmount),
    0,
  );

  const payouts = new Map<`0x${string}`, number>();
  if (payoutPlayers.length === 0 || loserPoolUnits === 0) {
    return payouts;
  }

  let distributed = 0;
  payoutPlayers.forEach((winner, index) => {
    let winnerUnits =
      totalWinnerWeight > 0
        ? Math.floor((loserPoolUnits * amountToUnits(winner.betAmount)) / totalWinnerWeight)
        : Math.floor(loserPoolUnits / payoutPlayers.length);

    if (index === payoutPlayers.length - 1) {
      winnerUnits = loserPoolUnits - distributed;
    } else {
      distributed += winnerUnits;
    }

    payouts.set(winner.wallet, winnerUnits);
  });

  return payouts;
}

function computeLoserDebitsForOnchain(players: LobbyPlayer[], winnersInput: `0x${string}`[]): Map<`0x${string}`, number> {
  const normalizedPlayers = normalizePlayerStakes(players);
  const winners = computeWinnerWalletSet(normalizedPlayers, winnersInput);
  const debits = new Map<`0x${string}`, number>();

  for (const player of normalizedPlayers) {
    if (!winners.has(player.wallet)) {
      debits.set(player.wallet, amountToUnits(player.betAmount));
    }
  }

  return debits;
}

async function performOnchainPayouts(params: {
  tokenAddress: `0x${string}`;
  players: LobbyPlayer[];
  winners: `0x${string}`[];
}): Promise<`0x${string}`[]> {
  const adminAccount = privateKeyToAccount(getAdminPrivateKey());
  const adminAddress = getAddress(adminAccount.address);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  const walletClient = createWalletClient({
    account: adminAccount,
    chain: baseSepolia,
    transport: http(),
  });

  const decimals = Number(
    await publicClient.readContract({
      address: params.tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  );

  const loserDebits = computeLoserDebitsForOnchain(params.players, params.winners);
  const debitTransfers: Array<{ loser: `0x${string}`; amount: bigint }> = [];

  for (const [loser, units] of loserDebits.entries()) {
    if (loser.toLowerCase() === adminAddress.toLowerCase() || units <= 0) {
      continue;
    }

    const amount = unitsToTokenAmount(units, decimals);
    if (amount <= BigInt(0)) {
      continue;
    }
    debitTransfers.push({ loser, amount });
  }

  for (const transfer of debitTransfers) {
    const [allowance, loserBalance] = await Promise.all([
      publicClient.readContract({
        address: params.tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [transfer.loser, adminAddress],
      }),
      publicClient.readContract({
        address: params.tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [transfer.loser],
      }),
    ]);

    if (allowance < transfer.amount) {
      throw new Error(
        `Settlement cannot debit loser ${transfer.loser}: allowance ${formatUnits(allowance, decimals)} is below required ${formatUnits(transfer.amount, decimals)}.`,
      );
    }
    if (loserBalance < transfer.amount) {
      throw new Error(
        `Settlement cannot debit loser ${transfer.loser}: balance ${formatUnits(loserBalance, decimals)} is below required ${formatUnits(transfer.amount, decimals)}.`,
      );
    }
  }

  const payouts = computePayoutsForOnchain(params.players, params.winners);
  const payoutTransfers: Array<{ winner: `0x${string}`; amount: bigint }> = [];

  for (const [winner, units] of payouts.entries()) {
    if (winner.toLowerCase() === adminAddress.toLowerCase() || units <= 0) {
      continue;
    }

    const amount = unitsToTokenAmount(units, decimals);
    if (amount <= BigInt(0)) {
      continue;
    }

    payoutTransfers.push({ winner, amount });
  }

  const txHashes: `0x${string}`[] = [];

  for (const transfer of debitTransfers) {
    let txHash: `0x${string}`;
    try {
      txHash = (await walletClient.writeContract({
        account: adminAccount,
        address: params.tokenAddress,
        abi: erc20Abi,
        functionName: "transferFrom",
        args: [transfer.loser, adminAddress, transfer.amount],
      })) as `0x${string}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown transferFrom error";
      throw new Error(
        `Loser debit failed for ${transfer.loser} amount ${formatUnits(transfer.amount, decimals)}: ${message}`,
      );
    }
    txHashes.push(txHash);
  }

  if (payoutTransfers.length === 0) {
    return txHashes;
  }

  const totalRequired = payoutTransfers.reduce((sum, transfer) => sum + transfer.amount, BigInt(0));
  const adminBalance = await publicClient.readContract({
    address: params.tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [adminAddress],
  });
  if (adminBalance < totalRequired) {
    throw new Error(
      `Insufficient admin token balance for winner payouts. Have ${formatUnits(adminBalance, decimals)}, need ${formatUnits(totalRequired, decimals)}.`,
    );
  }

  for (const transfer of payoutTransfers) {
    let txHash: `0x${string}`;
    try {
      txHash = (await walletClient.writeContract({
        account: adminAccount,
        address: params.tokenAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [transfer.winner, transfer.amount],
      })) as `0x${string}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown transfer error";
      throw new Error(
        `Winner payout failed for ${transfer.winner} amount ${formatUnits(transfer.amount, decimals)}: ${message}`,
      );
    }

    txHashes.push(txHash);
  }

  return txHashes;
}

export async function executePendingAction(
  action: PendingActionInternal,
): Promise<PendingActionExecutionResult> {
  const response = await submitSignedAction(action);

  if (action.type === "start") {
    const { appSessionId } = response.params as { appSessionId: `0x${string}` };

    return {
      type: "start",
      appSessionId,
      tokenAddress: action.meta.tokenAddress,
    };
  }

  let settlementTxHashes: `0x${string}`[] = [];
  let settlementError: string | null = null;

  try {
    settlementTxHashes = await performOnchainPayouts({
      tokenAddress: action.meta.tokenAddress,
      players: action.meta.players,
      winners: action.meta.winners,
    });
  } catch (error) {
    settlementError =
      error instanceof Error ? error.message : "Onchain settlement failed after close";
  }

  return {
    type: "close",
    settlementTxHashes,
    settlementError,
  };
}

/**
 * Helper function to get all open/resizing channels for a wallet
 */
async function getWalletChannels(
  ws: OpenWebSocket,
  wallet: `0x${string}`,
  tokenAddress: `0x${string}`,
  chainId: number
): Promise<
  Array<{
    channelId: `0x${string}`;
    participant: `0x${string}`;
    token: `0x${string}`;
    chainId: number;
    amount: bigint;
    wallet: `0x${string}`;
  }>
> {
  const queries: Array<{
    participant?: `0x${string}`;
    status: RPCChannelStatus;
  }> = [
    { participant: wallet, status: RPCChannelStatus.Open },
    { participant: wallet, status: RPCChannelStatus.Resizing },
    { status: RPCChannelStatus.Open },
    { status: RPCChannelStatus.Resizing },
  ];

  const merged = new Map<
    `0x${string}`,
    {
      channelId: `0x${string}`;
      participant: `0x${string}`;
      token: `0x${string}`;
      chainId: number;
      amount: bigint;
      wallet: `0x${string}`;
    }
  >();

  for (const query of queries) {
    const channelsResponse = await sendMessageAndWait({
      ws,
      message: createGetChannelsMessageV2(query.participant, query.status),
      expectedMethods: [RPCMethod.GetChannels],
    });

    const channels =
      (channelsResponse.params as {
        channels?: Array<{
          channelId: `0x${string}`;
          participant: `0x${string}`;
          token: `0x${string}`;
          chainId: number;
          amount: bigint;
          wallet: `0x${string}`;
        }>;
      }).channels ?? [];

    for (const channel of channels) {
      if (!merged.has(channel.channelId)) {
        merged.set(channel.channelId, channel);
      }
    }
  }

  return [...merged.values()]
    .filter(
      (entry) =>
        entry.chainId === chainId &&
        (getAddress(entry.wallet) === wallet || getAddress(entry.participant) === wallet) &&
        getAddress(entry.token) === tokenAddress,
    )
    .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));
}

/**
 * Helper function to get assets from Yellow Network
 */
async function getYellowAssets(ws: OpenWebSocket): Promise<RPCAsset[]> {
  const assetsResponse = await sendMessageAndWait({
    ws,
    message: createGetAssetsMessageV2(),
    expectedMethods: [RPCMethod.GetAssets, RPCMethod.Assets],
  });

  return (
    (assetsResponse.params as { assets?: RPCAsset[] }).assets ?? []
  );
}

/**
 * Prepare a proper channel withdrawal that closes the user's personal wallet channel 
 * and withdraws funds to their on-chain wallet. This is completely separate from the 
 * multi-user app sessions used for gameplay.
 * 
 * Flow:
 * 1. Check unified balance
 * 2. Find or create personal wallet channel with funds
 * 3. Create closeChannel message
 * 4. Return payload for user to sign
 */
export async function prepareWalletWithdrawal(params: {
  wallet: string;
  sessionKey: string;
  amount: string;
  authJwtToken?: string;
}): Promise<{
  actionId: string;
  channelId: string;
  amount: string;
  amountBaseUnits: string;
  tokenAddress: string;
  closeRequestPayload: RequestPayload;
}> {
  const wallet = getAddress(params.wallet);
  const sessionKey = getAddress(params.sessionKey);
  
  // Get token info first to know the correct decimals
  const tokenInfo = await withYellowConnection(async (ws) => {
    if (!params.authJwtToken) {
      throw new Error("Authentication required for withdrawal.");
    }
    await authenticateWsWithParticipantJwt(ws, params.authJwtToken);
    
    const assets = await getYellowAssets(ws);
    const asset = assets.find((a: RPCAsset) => a.symbol === getAssetId());
    if (!asset) {
      throw new Error(`Asset ${getAssetId()} not found.`);
    }
    
    return { symbol: asset.symbol, decimals: asset.decimals, tokenAddress: getAddress(asset.token) };
  });
  
  // Now check unified balance with correct decimals
  const unifiedBalance = await getUnifiedYellowBalance(wallet);
  const requestedAmount = parseUnits(params.amount, tokenInfo.decimals);
  
  if (BigInt(unifiedBalance.amount) < requestedAmount) {
    throw new Error(
      `Insufficient unified balance. You have ${formatUnits(BigInt(unifiedBalance.amount), tokenInfo.decimals)} but need ${params.amount}.`
    );
  }
  
  // Check if there's a recently created channel that might not be indexed yet
  const hintKey = getChannelHintKey(wallet, tokenInfo.tokenAddress, getBaseChainId());
  const hasRecentChannelHint = createdChannelHints.has(hintKey);
  
  console.log("[yellow] checking for wallet channel", {
    wallet,
    tokenAddress: tokenInfo.tokenAddress,
    chainId: getBaseChainId(),
    hasRecentChannelHint,
    hintKey,
  });
  
  // Get token info and personal wallet channels (not app sessions)
  const { token, candidateChannels } = await withYellowConnection(async (ws) => {
    if (!params.authJwtToken) {
      throw new Error("Authentication required for withdrawal.");
    }
    await authenticateWsWithParticipantJwt(ws, params.authJwtToken);
    
    const assets = await getYellowAssets(ws);
    const asset = assets.find((a: RPCAsset) => a.symbol === getAssetId());
    if (!asset) {
      throw new Error(`Asset ${getAssetId()} not found.`);
    }

    // Get user's personal wallet channels
    let channels = await getWalletChannels(ws, wallet, getAddress(asset.token), getBaseChainId());
    
    // If we have a recent channel hint but no channels found, poll for indexing
    if (hasRecentChannelHint && channels.length === 0) {
      console.log("[yellow] channel hint found, polling for indexed wallet channel...");
      
      const maxAttempts = 120; // 120 attempts × 1.5s = 180s = 3 minutes
      const pollIntervalMs = 1500;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        channels = await getWalletChannels(ws, wallet, getAddress(asset.token), getBaseChainId());
        
        if (channels.length > 0) {
          console.log("[yellow] wallet channel found after polling", {
            attempt,
            waitedSeconds: (attempt * pollIntervalMs) / 1000,
          });
          break;
        }
        
        if (attempt === maxAttempts) {
          console.log("[yellow] wallet channel polling exhausted", {
            wallet,
            asset: getAssetId(),
            chainId: getBaseChainId(),
            attempts: maxAttempts,
            pollMs: pollIntervalMs,
            totalWaitSeconds: (maxAttempts * pollIntervalMs) / 1000,
            hadRecentHint: true,
          });
        }
      }
    }
    
    return { token: asset, candidateChannels: channels };
  });

  // Parse amount
  const amountBaseUnits = parseUnits(params.amount, token.decimals);
  if (amountBaseUnits <= BigInt(0)) {
    throw new Error("Withdrawal amount must be greater than 0.");
  }

  // Find a channel with sufficient balance
  const suitableChannel = candidateChannels.find((ch: any) => ch.amount >= amountBaseUnits);
  
  if (!suitableChannel) {
    // Check unified balance to show helpful message
    const unifiedBalance = await getUnifiedYellowBalance(wallet);
    const availableBalance = formatUnits(BigInt(unifiedBalance.amount), tokenInfo.decimals);
    
    // No suitable channel - need to create one first using the existing withdrawal flow
    throw new Error(
      `No wallet channel found with ${params.amount} ${token.symbol}. You have ${availableBalance} ${token.symbol} in your unified balance.\n\nTo cash out:\n1. First click the green "Withdraw To Onchain" button and enter ${availableBalance} ${token.symbol}\n2. Wait 1-2 minutes for the channel to be created\n3. Then click "Cash Out" with your desired amount\n\nNote: This is a two-step process because funds must first move to a personal wallet channel before they can be withdrawn to your blockchain wallet.`
    );
  }

  // Create close channel message using session key
  const sessionPrivateKey = sessionKey as `0x${string}`;
  const signer = createECDSAMessageSigner(sessionPrivateKey);
  
  const closeMessage = await createCloseChannelMessage(
    signer,
    suitableChannel.channelId,
    wallet
  );

  const closeMessageParsed = JSON.parse(closeMessage);
  const closeRequestPayload = closeMessageParsed.req as RequestPayload;

  const actionId = randomActionId();
  channelWithdrawalActions.set(actionId, {
    id: actionId,
    wallet,
    channelId: suitableChannel.channelId,
    tokenAddress: getAddress(token.token),
    amount: params.amount,
    amountBaseUnits: amountBaseUnits.toString(),
    closeRequestPayload,
    createdAt: Date.now(),
  });

  return {
    actionId,
    channelId: suitableChannel.channelId,
    amount: params.amount,
    amountBaseUnits: amountBaseUnits.toString(),
    tokenAddress: getAddress(token.token),
    closeRequestPayload,
  };
}

/**
 * Execute the wallet channel withdrawal by:
 * 1. Closing the personal wallet channel on Yellow Network
 * 2. Submitting the close proof to chain
 * 3. Withdrawing from custody contract to user's on-chain wallet
 * 
 * This is completely separate from the game's multi-user app sessions.
 */
export async function executeWalletWithdrawal(params: {
  actionId: string;
  wallet: string;
  sessionKey: string;
  signature: `0x${string}`;
  authJwtToken?: string;
}): Promise<{
  channelId: string;
  amount: string;
  closeTxHash: string;
  withdrawalTxHash: string;
}> {
  const wallet = getAddress(params.wallet);
  const sessionKey = getAddress(params.sessionKey);
  
  const action = channelWithdrawalActions.get(params.actionId);
  if (!action || action.wallet !== wallet) {
    throw new Error("Withdrawal action not found or does not match wallet.");
  }

  // Verify signature
  const signatureValid = await verifySessionSignature({
    sessionKey,
    requestPayload: action.closeRequestPayload,
    signature: params.signature,
  });
  if (!signatureValid) {
    throw new Error("Invalid session signature for withdrawal.");
  }

  try {
    // Step 1: Close the personal wallet channel on Yellow Network
    const closeResponse = await withYellowConnection(async (ws) => {
      if (!params.authJwtToken) {
        throw new Error("Authentication required.");
      }
      await authenticateWsWithParticipantJwt(ws, params.authJwtToken);

      const response = await sendMessageAndWait({
        ws,
        message: JSON.stringify({
          req: action.closeRequestPayload,
          sig: [params.signature],
        }),
        expectedMethods: [RPCMethod.CloseChannel],
      });

      return response.params as {
        finalState: {
          channelId: `0x${string}`;
          intent: number;
          version: number;
          data: `0x${string}`;
          allocations: Array<{
            destination: `0x${string}`;
            token: `0x${string}`;
            amount: bigint;
          }>;
          serverSignature: `0x${string}`;
        };
      };
    });

    console.log("[yellow] wallet channel closed on Yellow Network", {
      channelId: action.channelId,
      wallet,
    });

    // Step 2 & 3: Submit close proof to chain and withdraw from custody
    const account = privateKeyToAccount(getAdminPrivateKey());
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    }) as any; // Type workaround for viem version mismatch
    
    const walletClient = createWalletClient({
      chain: baseSepolia,
      transport: http(),
      account,
    }) as any; // Type workaround for viem version mismatch

    // Import NitroliteClient
    const { NitroliteClient, WalletStateSigner } = await import("@erc7824/nitrolite");
    
    const client = new NitroliteClient({
      publicClient,
      walletClient,
      stateSigner: new WalletStateSigner(walletClient),
      addresses: {
        custody: "0x019B65A265EB3363822f2752141b3dF16131b262", // Sepolia custody address
        adjudicator: "0x7c7ccbc98469190849BCC6c926307794fDfB11F2", // Sepolia adjudicator
      },
      chainId: baseSepolia.id,
      challengeDuration: BigInt(3600),
    });

    // Get channel data
    const channelData = await withYellowConnection(async (ws) => {
      if (!params.authJwtToken) {
        throw new Error("Authentication required.");
      }
      await authenticateWsWithParticipantJwt(ws, params.authJwtToken);
      
      const channels = await getWalletChannels(ws, wallet, action.tokenAddress, getBaseChainId());
      return channels.find((ch) => ch.channelId === action.channelId);
    });

    if (!channelData) {
      throw new Error("Channel not found for close operation.");
    }

    // Submit close to chain
    const closeTxHash = await client.closeChannel({
      finalState: {
        channelId: closeResponse.finalState.channelId,
        intent: closeResponse.finalState.intent as any,
        version: BigInt(closeResponse.finalState.version),
        data: closeResponse.finalState.data,
        allocations: closeResponse.finalState.allocations,
        serverSignature: closeResponse.finalState.serverSignature,
      },
    });

    console.log("[yellow] wallet channel closed on-chain", { 
      channelId: action.channelId, 
      txHash: closeTxHash 
    });

    // Withdraw from custody contract to user's wallet
    const withdrawalAmount = BigInt(action.amountBaseUnits);
    const withdrawalTxHash = await client.withdrawal(
      action.tokenAddress as `0x${string}`,
      withdrawalAmount
    );

    console.log("[yellow] withdrawal to wallet executed", {
      wallet,
      amount: action.amount,
      txHash: withdrawalTxHash,
    });

    // Cleanup
    channelWithdrawalActions.delete(params.actionId);

    return {
      channelId: action.channelId,
      amount: action.amount,
      closeTxHash,
      withdrawalTxHash,
    };
  } catch (error) {
    console.error("[yellow] wallet withdrawal failed", error);
    throw error;
  }
}
