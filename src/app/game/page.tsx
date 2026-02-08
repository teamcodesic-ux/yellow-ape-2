"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { useAccount, useChainId } from "wagmi";
import { erc20Abi } from "@/lib/erc20";
import type { GameState } from "@/types/game";
import type {
  PublicConfig,
  StateResponse,
  PendingActionDetails,
  PendingActionResponse,
  UnifiedBalanceResponse,
  WithdrawOnchainPrepareResponse,
  WithdrawOnchainExecuteResponse,
  WalletWithdrawalPrepareResponse,
  WalletWithdrawalExecuteResponse,
  ParticipantAuthChallenge,
} from "@/types/page";
import {
  normalizeHexAddress,
  toPayloadHex,
  serializeUnknownError,
  formatDisplayAmount,
  formatTokenBalance,
  getOrCreateSessionPrivateKey,
  rotateSessionPrivateKey,
  getSessionPrivateKey,
  buildAuthTypedData,
  readJson,
} from "@/lib/utils";
import { TopNavbar } from "@/components/TopNavbar";
import { CashOutBar } from "@/components/CashOutBar";
import { LobbySection } from "@/components/LobbySection";
import { SessionControls } from "@/components/SessionControls";
import { PendingSignatures } from "@/components/PendingSignatures";
import { RoundResult } from "@/components/RoundResult";
import { SystemMessages } from "@/components/SystemMessages";
import { GameNavbar, CrashGraph, BetPanel, GameHistory, WithdrawSection, PendingSignaturesPanel, RoundResultPanel } from "@/components/game";
import useGameLoop from "@/hooks/useGameLoop";
import { motion } from "framer-motion";

const EMPTY_STATE: StateResponse = {
  players: [],
  status: "lobby",
  crashMultiplier: null,
  winners: [],
  yellowSessionId: null,
  tokenAddress: null,
  pendingAction: null,
  settlementTxHashes: [],
  error: null,
  updatedAt: "",
  canStart: false,
};

const DEFAULT_CHAIN_ID = 84532;

export default function HomePage() {
  const { address: account } = useAccount();
  const chainId = useChainId();

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<StateResponse>(EMPTY_STATE);
  const [pendingActionData, setPendingActionData] = useState<PendingActionDetails | null>(null);
  const [multiplierInput, setMultiplierInput] = useState("2.00");
  const [betAmountInput, setBetAmountInput] = useState("1.00");
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [unifiedBalance, setUnifiedBalance] = useState<string>("0");
  const [unifiedBalanceRaw, setUnifiedBalanceRaw] = useState<string>("0");
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");
  const [cashOutAmountInput, setCashOutAmountInput] = useState<string>("");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [unifiedBalanceLoading, setUnifiedBalanceLoading] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [channelBootstrapPending, setChannelBootstrapPending] = useState(false);

  const targetChainId = config?.chainId ?? DEFAULT_CHAIN_ID;
  const networkOk = chainId === targetChainId;

  const me = useMemo(() => {
    if (!account) {
      return null;
    }

    const lower = account.toLowerCase();
    return state.players.find((player) => player.wallet.toLowerCase() === lower) ?? null;
  }, [account, state.players]);

  const canSignPending = useMemo(() => {
    if (!account || !pendingActionData) {
      return false;
    }

    const lower = account.toLowerCase();
    const required = pendingActionData.requiredWallets.some((wallet) => wallet.toLowerCase() === lower);
    const signed = pendingActionData.signedWallets.some((wallet) => wallet.toLowerCase() === lower);
    const result = required && !signed;
    
    if (pendingActionData) {
      console.log('[canSignPending]', {
        account: account.slice(0, 6) + '...' + account.slice(-4),
        required,
        signed,
        canSign: result,
        action: pendingActionData.type,
        progress: `${pendingActionData.signedWallets.length}/${pendingActionData.requiredWallets.length}`
      });
    }
    
    return result;
  }, [account, pendingActionData]);

  const availableUnifiedAmount = Number(unifiedBalanceRaw);
  const requestedWithdrawAmount = Number(withdrawAmountInput);
  const requestedCashOutAmount = Number(cashOutAmountInput);
  const hasUnifiedBalance = Number.isFinite(availableUnifiedAmount) && availableUnifiedAmount > 0;
  const hasValidWithdrawAmount =
    Number.isFinite(requestedWithdrawAmount) && requestedWithdrawAmount > 0;
  const withdrawAmountWithinBalance =
    hasValidWithdrawAmount && hasUnifiedBalance && requestedWithdrawAmount <= availableUnifiedAmount;
  const hasValidCashOutAmount =
    Number.isFinite(requestedCashOutAmount) && requestedCashOutAmount > 0;
  const cashOutAmountWithinBalance =
    hasValidCashOutAmount && hasUnifiedBalance && requestedCashOutAmount <= availableUnifiedAmount;
  const canCashOut = cashOutAmountWithinBalance && account && !submitting;

  const pendingActionFullySigned = useMemo(() => {
    if (!state.pendingAction) {
      return false;
    }

    return state.pendingAction.signedWallets.length === state.pendingAction.requiredWallets.length;
  }, [state.pendingAction]);

  const settlementTxHashes = useMemo(() => {
    return Array.isArray(state.settlementTxHashes) ? state.settlementTxHashes : [];
  }, [state.settlementTxHashes]);

  const refreshState = useCallback(async () => {
    try {
      const [nextState, pendingResponse] = await Promise.all([
        readJson<StateResponse>("/api/game/state"),
        readJson<PendingActionResponse>("/api/game/pending-action").catch(() => ({ pendingAction: null })),
      ]);

      setState({
        ...EMPTY_STATE,
        ...nextState,
        players: Array.isArray(nextState.players) ? nextState.players : [],
        winners: Array.isArray(nextState.winners) ? nextState.winners : [],
        settlementTxHashes: Array.isArray(nextState.settlementTxHashes)
          ? nextState.settlementTxHashes
          : [],
      });
      setPendingActionData(pendingResponse.pendingAction);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Failed to load game state");
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const nextConfig = await readJson<PublicConfig>("/api/config/public");
      setConfig(nextConfig);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Failed to load config");
    }
  }, []);

  useEffect(() => {
    refreshConfig();
    refreshState();
  }, [refreshConfig, refreshState]);

  useEffect(() => {
    const interval = setInterval(refreshState, 2000);
    return () => clearInterval(interval);
  }, [refreshState]);

  const submitWithFeedback = useCallback(
    async (task: () => Promise<void>) => {
      setSubmitting(true);
      setUiError(null);
      setUiMessage(null);

      try {
        await task();
        await refreshState();
      } catch (error) {
        setUiError(error instanceof Error ? error.message : "Action failed");
      } finally {
        setSubmitting(false);
      }
    },
    [refreshState],
  );

  const authorizeParticipantSession = useCallback(
    async (wallet: `0x${string}`): Promise<`0x${string}`> => {
      if (!window.ethereum) {
        throw new Error("MetaMask is required");
      }

      const requestChallenge = async (sessionKey: `0x${string}`): Promise<ParticipantAuthChallenge> => {
        return await readJson<ParticipantAuthChallenge>("/api/yellow/auth/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, sessionKey }),
        });
      };

      const verifyWithSessionKey = async (sessionKey: `0x${string}`): Promise<void> => {
        const ethereum = window.ethereum;
        if (!ethereum) {
          throw new Error("MetaMask is required");
        }

        const challenge = await requestChallenge(sessionKey);
        const typedData = buildAuthTypedData({
          challenge: challenge.challenge,
          wallet,
          sessionKey,
          scope: challenge.scope,
          appName: challenge.appName,
          expiresAt: challenge.expiresAt,
          allowances: challenge.allowances,
        });

        const signature = (await ethereum.request({
          method: "eth_signTypedData_v4",
          params: [wallet, JSON.stringify(typedData)],
        })) as string;

        await readJson<{ success: boolean }>("/api/yellow/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            authToken: challenge.authToken,
            wallet,
            sessionKey,
            challenge: challenge.challenge,
            signature,
            expiresAt: challenge.expiresAt,
            scope: challenge.scope,
            appName: challenge.appName,
          }),
        });
      };

      let sessionPrivateKey = getOrCreateSessionPrivateKey(wallet);
      let sessionKey = normalizeHexAddress(privateKeyToAccount(sessionPrivateKey).address);

      try {
        await verifyWithSessionKey(sessionKey);
        return sessionKey;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (!message.includes("session key already exists but is expired")) {
          throw error;
        }
      }

      sessionPrivateKey = rotateSessionPrivateKey(wallet);
      sessionKey = normalizeHexAddress(privateKeyToAccount(sessionPrivateKey).address);
      await verifyWithSessionKey(sessionKey);
      return sessionKey;
    },
    [],
  );

  const joinLobby = useCallback(async () => {
    if (!account) {
      throw new Error("Connect MetaMask first");
    }

    if (!networkOk) {
      throw new Error("Please switch to the correct network using the wallet button.");
    }

    const multiplier = Number(multiplierInput);
    if (!Number.isFinite(multiplier)) {
      throw new Error("Multiplier must be a number");
    }

    const betAmount = Number(betAmountInput);
    if (!Number.isFinite(betAmount) || betAmount <= 0) {
      throw new Error("Bet amount must be greater than 0");
    }

    if (!config?.tokenAddress || !config.adminWallet) {
      throw new Error("Token mapping or admin wallet is not available.");
    }

    if (!window.ethereum) {
      throw new Error("MetaMask is required");
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(baseSepolia.rpcUrls.default.http[0]),
    });
    const decimals = Number(
      await publicClient.readContract({
        address: config.tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    );
    const requiredAmount = parseUnits(betAmount.toString(), decimals);
    const currentAllowance = await publicClient.readContract({
      address: config.tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, config.adminWallet],
    });

    if (currentAllowance < requiredAmount) {
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [config.adminWallet, requiredAmount],
      });

      const approvalTxHash = (await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            to: config.tokenAddress,
            data: approveData,
          },
        ],
      })) as string;

      await publicClient.waitForTransactionReceipt({ hash: approvalTxHash as Hex });
    }

    const sessionKey = await authorizeParticipantSession(account);

    await readJson<GameState>("/api/game/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: account, sessionKey, multiplier, betAmount }),
    });

    setUiMessage(
      me
        ? "Bet and multiplier updated (allowance checked)"
        : "Joined lobby, allowance approved (if needed), and session key authorized",
    );
  }, [
    account,
    authorizeParticipantSession,
    betAmountInput,
    config?.adminWallet,
    config?.tokenAddress,
    me,
    multiplierInput,
    networkOk,
  ]);

  const leaveLobby = useCallback(async () => {
    if (!account) {
      throw new Error("Connect MetaMask first");
    }

    await readJson<GameState>("/api/game/leave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: account }),
    });

    setUiMessage("Left lobby");
  }, [account]);

  const startSession = useCallback(async () => {
    if (!config?.tokenAddress || !config?.adminWallet) {
      throw new Error("Token mapping/admin wallet is not available. Check Yellow config first.");
    }

    await readJson<GameState>("/api/game/start-session", {
      method: "POST",
    });

    setUiMessage("Start action created. Waiting for all participant signatures.");
  }, [config?.adminWallet, config?.tokenAddress]);

  const endSession = useCallback(async () => {
    await readJson<GameState>("/api/game/end-session", {
      method: "POST",
    });

    setUiMessage("Close action created. Waiting for all participant signatures.");
  }, []);

  const withdrawUnifiedToOnchain = useCallback(async () => {
    if (!account) {
      throw new Error("Connect MetaMask first");
    }

    if (!window.ethereum) {
      throw new Error("MetaMask is required");
    }

    if (!networkOk) {
      throw new Error("Please switch to the correct network using the wallet button.");
    }

    if (!config?.tokenAddress) {
      throw new Error("Token mapping is unavailable. Check Yellow config first.");
    }

    const rawAmount = withdrawAmountInput.trim();
    const numericAmount = Number(rawAmount);
    const availableAmount = Number(unifiedBalanceRaw);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error("Enter a valid withdrawal amount greater than 0.");
    }
    if (!Number.isFinite(availableAmount) || availableAmount <= 0) {
      throw new Error("Unified balance must be greater than 0 to withdraw on-chain.");
    }
    if (numericAmount > availableAmount) {
      throw new Error("Requested amount exceeds available unified balance.");
    }

    await authorizeParticipantSession(account);
    const sessionPrivateKey = getSessionPrivateKey(account);
    if (!sessionPrivateKey) {
      throw new Error("No local session key found. Join lobby to authorize first.");
    }

    const prepared = await readJson<WithdrawOnchainPrepareResponse>("/api/yellow/withdraw-onchain/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: account,
        amount: rawAmount,
        allowCreateIfMissing: true,
      }),
    });
    if (!Array.isArray(prepared.requestPayloads) || prepared.requestPayloads.length === 0) {
      throw new Error("No withdraw payloads were prepared. Retry withdrawal.");
    }

    const signer = privateKeyToAccount(sessionPrivateKey as Hex);
    const signatures = await Promise.all(
      prepared.requestPayloads.map(async (payload) => {
        const payloadHex = toPayloadHex(payload);
        return await signer.sign({ hash: keccak256(payloadHex) });
      }),
    );

    const execution = await readJson<WithdrawOnchainExecuteResponse>("/api/yellow/withdraw-onchain/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionId: prepared.actionId,
        wallet: account,
        signatures,
        prepared: {
          wallet: account,
          flow: prepared.flow,
          amount: prepared.amount,
          amountBaseUnits: prepared.amountBaseUnits,
          tokenAddress: prepared.tokenAddress,
          custodyAddress: prepared.custodyAddress,
          requestPayloads: prepared.requestPayloads,
          requestMethods: prepared.requestMethods,
          perChannelAmountsBaseUnits: prepared.perChannelAmountsBaseUnits,
        },
      }),
    });
    if (!Array.isArray(execution.txs)) {
      throw new Error("Invalid on-chain execution response.");
    }
    if (execution.flow === "withdraw" && execution.txs.length === 0) {
      throw new Error("No on-chain transactions returned for withdrawal.");
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(baseSepolia.rpcUrls.default.http[0]),
    });
    const txHashes: string[] = [];
    for (let index = 0; index < execution.txs.length; index += 1) {
      const tx = execution.txs[index];

      try {
        try {
          await publicClient.call({
            account,
            to: tx.to,
            data: tx.data,
          });
        } catch (preflightError) {
          console.error("[withdraw] preflight eth_call reverted", {
            index,
            flow: execution.flow,
            tx,
            error: serializeUnknownError(preflightError),
          });
        }

        const txHash = (await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: account,
              to: tx.to,
              data: tx.data,
            },
          ],
        })) as string;

        txHashes.push(txHash);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
        if (receipt.status !== "success") {
          console.error("[withdraw] transaction receipt status is not success", {
            index,
            flow: execution.flow,
            txHash,
            tx,
            receipt,
          });
          throw new Error(
            `On-chain transaction failed: ${txHash}. Open browser console for full receipt and revert diagnostics.`,
          );
        }
      } catch (txStepError) {
        console.error("[withdraw] tx step failed", {
          index,
          flow: execution.flow,
          tx,
          sentTxHashes: txHashes,
          error: serializeUnknownError(txStepError),
        });
        throw txStepError;
      }
    }

    if (execution.flow === "open_channel") {
      setChannelBootstrapPending(true);
      if (txHashes.length > 0) {
        setUiMessage(
          `Channel opened (${txHashes.join(", ")}). Wait a few seconds, then click Withdraw again.`,
        );
      } else {
        setUiMessage("Channel opened on Yellow. Wait a few seconds, then click Withdraw again.");
      }
      return;
    }

    setChannelBootstrapPending(false);
    setUiMessage(`On-chain withdrawal submitted (${txHashes.length} tx): ${txHashes.join(", ")}`);
  }, [
    account,
    authorizeParticipantSession,
    channelBootstrapPending,
    config?.tokenAddress,
    networkOk,
    withdrawAmountInput,
    unifiedBalanceRaw,
  ]);

  const cashOutToWallet = useCallback(async () => {
    if (!account) {
      throw new Error("Connect MetaMask first");
    }

    const sessionPrivateKey = getSessionPrivateKey(account);
    if (!sessionPrivateKey) {
      throw new Error("No session key found. Please join the lobby first.");
    }

    const sessionKey = normalizeHexAddress(privateKeyToAccount(sessionPrivateKey).address);
    const rawAmount = cashOutAmountInput.trim();
    if (!rawAmount) {
      throw new Error("Enter a cash-out amount greater than 0.");
    }
    if (Number(unifiedBalanceRaw) <= 0) {
      throw new Error("Unified balance must be greater than 0 to cash out.");
    }

    // Ensure we have valid authentication (may prompt for MetaMask signature if expired)
    setUiMessage("Authenticating session...");
    await authorizeParticipantSession(account);

    // Step 1: Prepare wallet withdrawal (will handle auth internally)
    setUiMessage("Preparing cash-out from your personal wallet channel...");
    const prepared = await readJson<WalletWithdrawalPrepareResponse>(
      "/api/yellow/withdraw-to-wallet/prepare",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: account,
          sessionKey,
          amount: rawAmount,
        }),
      }
    );

    if (!prepared.closeRequestPayload) {
      throw new Error("No close payload was prepared. Cannot proceed with cash-out.");
    }

    // Step 2: Sign the close message
    setUiMessage(`Signing channel close message...`);
    const signer = privateKeyToAccount(sessionPrivateKey as Hex);
    const message = keccak256(toHex(JSON.stringify(prepared.closeRequestPayload)));
    const signature = await signer.signMessage({ message: { raw: message } });

    // Step 3: Execute wallet withdrawal
    setUiMessage("Closing channel and withdrawing to your wallet...");
    const execution = await readJson<WalletWithdrawalExecuteResponse>(
      "/api/yellow/withdraw-to-wallet/execute",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: prepared.actionId,
          wallet: account,
          sessionKey,
          signature,
        }),
      }
    );

    setUiMessage(
      `✅ Cash-out complete! ${prepared.amount} ${config?.tokenSymbol ?? "tokens"} withdrawn to your wallet. Close tx: ${execution.closeTxHash.slice(0, 10)}..., Withdrawal tx: ${execution.withdrawalTxHash.slice(0, 10)}...`
    );
    setCashOutAmountInput("");
  }, [
    account,
    cashOutAmountInput,
    unifiedBalanceRaw,
    authorizeParticipantSession,
    config?.tokenSymbol,
  ]);

  const finalizePendingAction = useCallback(async () => {
    if (!state.pendingAction) {
      throw new Error("No pending action to finalize");
    }

    await readJson<GameState>("/api/game/finalize-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId: state.pendingAction.id }),
    });

    setUiMessage("Pending action finalized");
  }, [state.pendingAction]);

  const signPendingAction = useCallback(async () => {
    if (!account) {
      throw new Error("Connect MetaMask first");
    }

    if (!pendingActionData) {
      throw new Error("No pending action to sign");
    }

    const signWithAction = async (action: PendingActionDetails) => {
      const sessionPrivateKey = getSessionPrivateKey(account);
      if (!sessionPrivateKey) {
        throw new Error("No local session key found for this wallet. Join lobby to authorize first.");
      }

      const accountLower = account.toLowerCase();
      const required = action.requiredWallets.some((wallet) => wallet.toLowerCase() === accountLower);
      if (!required) {
        throw new Error("This wallet is not required to sign the pending action");
      }

      const signer = privateKeyToAccount(sessionPrivateKey as Hex);
      const payloadHex = toPayloadHex(action.requestPayload);
      const signature = await signer.sign({ hash: keccak256(payloadHex) });

      await readJson<GameState>("/api/game/sign-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: action.id,
          wallet: account,
          signature,
        }),
      });
    };

    try {
      await signWithAction(pendingActionData);
      setUiMessage("Signature submitted");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("session key authorization expired")) {
        throw error;
      }
    }

    // Auto recover from expired participant authorization without forcing a lobby re-join.
    await authorizeParticipantSession(account);
    const latestPending = (await readJson<PendingActionResponse>("/api/game/pending-action")).pendingAction;
    if (!latestPending) {
      throw new Error("Pending action was cleared while re-authorizing. Refresh and try again.");
    }

    await signWithAction(latestPending);
    setUiMessage("Session re-authorized and signature submitted");
  }, [account, authorizeParticipantSession, pendingActionData]);

  useEffect(() => {
    const tokenAddress = config?.tokenAddress;

    if (!account || !tokenAddress) {
      return;
    }

    let cancelled = false;

    const readBalance = async () => {
      setBalanceLoading(true);
      try {
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(baseSepolia.rpcUrls.default.http[0]),
        });

        const [balanceRaw, tokenDecimals] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "decimals",
          }),
        ]);

        if (!cancelled) {
          setTokenBalance(formatTokenBalance(balanceRaw, Number(tokenDecimals)));
        }
      } catch {
        if (!cancelled) {
          setTokenBalance("0");
        }
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
        }
      }
    };

    void readBalance();
    const interval = setInterval(readBalance, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [account, config?.tokenAddress]);

  useEffect(() => {
    if (!account) {
      setUnifiedBalance("0");
      setUnifiedBalanceRaw("0");
      setWithdrawAmountInput("");
      setChannelBootstrapPending(false);
      return;
    }

    let cancelled = false;

    const readUnifiedBalance = async () => {
      setUnifiedBalanceLoading(true);
      try {
        const response = await readJson<UnifiedBalanceResponse>(
          `/api/yellow/unified-balance?wallet=${encodeURIComponent(account)}`,
        );

        if (!cancelled) {
          setUnifiedBalanceRaw(response.amount);
          setUnifiedBalance(formatDisplayAmount(response.amount));
          setWithdrawAmountInput((current) => (current.trim() === "" ? response.amount : current));
        }
      } catch {
        if (!cancelled) {
          setUnifiedBalanceRaw("0");
          setUnifiedBalance("0");
        }
      } finally {
        if (!cancelled) {
          setUnifiedBalanceLoading(false);
        }
      }
    };

    void readUnifiedBalance();
    const interval = setInterval(readUnifiedBalance, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [account]);

  const canJoin = !!account && state.status !== "active" && !state.pendingAction && !submitting;
  const canWithdrawUnified =
    !!account &&
    !!config?.tokenAddress &&
    networkOk &&
    withdrawAmountWithinBalance &&
    !submitting;
  const canStartSession =
    state.canStart &&
    !!config?.tokenAddress &&
    !!config?.adminWallet &&
    state.status !== "active" &&
    !state.pendingAction &&
    !submitting;
  const startSessionDisabledReason = canStartSession
    ? null
    : submitting
      ? "Another action is in progress."
      : state.status === "active"
        ? "Session is already active."
        : state.pendingAction
          ? pendingActionFullySigned
            ? "A pending action is fully signed. Finalize it first."
            : "A pending action exists. Collect all signatures first."
          : !config?.tokenAddress || !config?.adminWallet
            ? "Token mapping/admin wallet is unavailable. Check Yellow config."
            : "Need at least 1 player with valid multiplier and bet amount.";
  const startSessionLabel = state.status === "ended" ? "Start New Session" : "Start Session";

  // ── Automation: auto-sign, auto-end, auto-restart ──────────────────────

  // Auto-sign: when we detect a pending action we need to sign, do it automatically
  const autoSignLockRef = useRef(false);
  useEffect(() => {
    if (!canSignPending || submitting || autoSignLockRef.current) return;
    console.log('[auto-sign] Triggering auto-sign for', account?.slice(0, 6) + '...' + account?.slice(-4));
    autoSignLockRef.current = true;
    setUiMessage("Auto-signing pending action...");
    submitWithFeedback(signPendingAction).finally(() => {
      autoSignLockRef.current = false;
    });
  }, [canSignPending, submitting, submitWithFeedback, signPendingAction, account]);

  // Auto-end: when session becomes active, wait a short delay then auto-end
  const AUTO_END_DELAY_MS = 6_000;
  useEffect(() => {
    if (state.status !== "active" || !!state.pendingAction || submitting) return;
    const timer = setTimeout(() => {
      setUiMessage("Round complete — auto-ending session...");
      void submitWithFeedback(endSession);
    }, AUTO_END_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.status, state.pendingAction, submitting, submitWithFeedback, endSession]);

  // ── End automation ─────────────────────────────────────────────────────

  // Auto-reset: after the round ends, show result for a few seconds then go back to lobby
  const RESET_LOBBY_DELAY_MS = 5_000;
  useEffect(() => {
    if (state.status !== "ended" || !!state.pendingAction || submitting) return;
    const timer = setTimeout(async () => {
      try {
        console.log("[auto-reset] Resetting to lobby...");
        const res = await fetch("/api/game/reset-lobby", { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.warn("[auto-reset] Reset failed:", body.error ?? res.statusText);
        }
        await refreshState();
      } catch (err) {
        console.warn("[auto-reset] Reset error:", err);
      }
    }, RESET_LOBBY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.status, state.pendingAction, submitting, refreshState]);

  // Compute an automation status label for the UI
  const autoStatus = useMemo(() => {
    if (state.pendingAction && canSignPending) return "signing";
    if (state.pendingAction) return "waiting-signatures";
    if (state.status === "active") return "active";
    if (state.status === "ended") return "ended" as any;
    if (state.canStart) return "ready";
    return "waiting-players";
  }, [state.pendingAction, canSignPending, state.status, state.canStart]);

  // Start the crash-graph animation, driven by the server's crash multiplier
  useGameLoop(state.crashMultiplier, state.status === "active");

  return (
    <div className="h-screen flex flex-col bg-[#0a0e27] overflow-hidden">
      {/* Top Navbar */}
      <GameNavbar
        networkOk={networkOk}
        targetChainId={targetChainId}
        config={config}
        tokenBalance={tokenBalance}
        balanceLoading={balanceLoading}
        unifiedBalance={unifiedBalance}
        unifiedBalanceLoading={unifiedBalanceLoading}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 px-5 py-5">
        {/* Single Bordered Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex-1 flex flex-col lg:flex-row min-h-0 border border-white/10 rounded-2xl overflow-hidden glass-subtle"
        >
          {/* Left Side - Lobby Panel */}
          <motion.aside
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="w-full lg:w-[340px] xl:w-[380px] border-r border-white/10 flex flex-col shrink-0"
            style={{ background: "rgba(14, 19, 36, 0.5)" }}
          >
            {/* Withdraw Section */}
            <div className="p-4 pb-0">
              <WithdrawSection
                withdrawAmountInput={withdrawAmountInput}
                setWithdrawAmountInput={setWithdrawAmountInput}
                onWithdraw={() => submitWithFeedback(withdrawUnifiedToOnchain)}
                canWithdraw={canWithdrawUnified}
                submitting={submitting}
                channelBootstrapPending={channelBootstrapPending}
              />
            </div>

            {/* Lobby Panel */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="h-full flex flex-col gap-4 p-4">
                <BetPanel
                  status={state.status}
                  players={state.players}
                  multiplierInput={multiplierInput}
                  onMultiplierChange={setMultiplierInput}
                  betAmountInput={betAmountInput}
                  onBetAmountChange={setBetAmountInput}
                  canJoin={canJoin}
                  isInLobby={!!me}
                  onJoin={() => void submitWithFeedback(joinLobby)}
                  onLeave={() => void submitWithFeedback(leaveLobby)}
                  canLeave={!!me && state.status !== "active" && !state.pendingAction && !submitting}
                  autoStatus={autoStatus}
                />
                
                {/* Pending Signatures */}
                <PendingSignaturesPanel
                  pendingActionData={pendingActionData}
                  submitting={submitting}
                  onFinalize={() => submitWithFeedback(finalizePendingAction)}
                />
                
                {/* Round Result — only visible after the round ends */}
                {state.status === "ended" && (
                  <RoundResultPanel
                    crashMultiplier={state.crashMultiplier}
                    winners={state.winners}
                    roundPlayers={state.players}
                    settlementTxHashes={settlementTxHashes}
                  />
                )}
              </div>
            </div>
          </motion.aside>

          {/* Right Side - Graph + History + Controls */}
          <div className="flex-1 flex flex-col min-h-0" style={{ background: "rgba(10, 14, 39, 0.4)" }}>
            {/* Graph */}
            <div className="flex-1 relative min-h-0">
              <CrashGraph />
            </div>

            {/* Game History */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="border-t border-white/10"
            >
              <GameHistory />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
