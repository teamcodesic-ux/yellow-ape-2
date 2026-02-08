import { formatUnits, getAddress, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { RequestPayload } from "@/types/page";

const SESSION_KEY_PREFIX = "yellow-crash-session-key";

export function shortenAddress(value: string | null): string {
  if (!value) {
    return "Not connected";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function toChainHex(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export function normalizeHexAddress(value: string): `0x${string}` {
  return getAddress(value);
}

export function toPayloadHex(payload: RequestPayload): `0x${string}` {
  return toHex(
    JSON.stringify(payload, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
  );
}

export function toSafeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function serializeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const maybeWithFields = error as Error & {
      shortMessage?: string;
      details?: string;
      cause?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      shortMessage: maybeWithFields.shortMessage,
      details: maybeWithFields.details,
      stack: error.stack,
      cause:
        maybeWithFields.cause instanceof Error
          ? {
              name: maybeWithFields.cause.name,
              message: maybeWithFields.cause.message,
              stack: maybeWithFields.cause.stack,
            }
          : maybeWithFields.cause,
    };
  }

  return { value: error };
}

export function formatDisplayAmount(value: string, decimals = 4): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  return numeric.toFixed(decimals);
}

export function formatTokenBalance(rawBalance: bigint, decimals: number): string {
  const formatted = formatUnits(rawBalance, decimals);
  if (!formatted.includes(".")) {
    return formatted;
  }
  return formatted.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function getSessionStorageKey(wallet: string): string {
  return `${SESSION_KEY_PREFIX}:${wallet.toLowerCase()}`;
}

export function getOrCreateSessionPrivateKey(wallet: string): `0x${string}` {
  const storageKey = getSessionStorageKey(wallet);
  const existing = window.localStorage.getItem(storageKey);

  if (existing && /^0x[0-9a-fA-F]{64}$/.test(existing)) {
    return existing as `0x${string}`;
  }

  const generated = generatePrivateKey();
  window.localStorage.setItem(storageKey, generated);
  return generated;
}

export function rotateSessionPrivateKey(wallet: string): `0x${string}` {
  const generated = generatePrivateKey();
  window.localStorage.setItem(getSessionStorageKey(wallet), generated);
  return generated;
}

export function getSessionPrivateKey(wallet: string): `0x${string}` | null {
  const existing = window.localStorage.getItem(getSessionStorageKey(wallet));
  if (!existing || !/^0x[0-9a-fA-F]{64}$/.test(existing)) {
    return null;
  }
  return existing as `0x${string}`;
}

export function buildAuthTypedData(params: {
  challenge: string;
  wallet: `0x${string}`;
  sessionKey: `0x${string}`;
  scope: string;
  appName: string;
  expiresAt: number;
  allowances: Array<{ asset: string; amount: string }>;
}): Record<string, unknown> {
  return {
    domain: { name: params.appName },
    types: {
      EIP712Domain: [{ name: "name", type: "string" }],
      Allowance: [
        { name: "asset", type: "string" },
        { name: "amount", type: "string" },
      ],
      Policy: [
        { name: "challenge", type: "string" },
        { name: "scope", type: "string" },
        { name: "wallet", type: "address" },
        { name: "session_key", type: "address" },
        { name: "expires_at", type: "uint64" },
        { name: "allowances", type: "Allowance[]" },
      ],
    },
    primaryType: "Policy",
    message: {
      wallet: params.wallet,
      challenge: params.challenge,
      scope: params.scope,
      session_key: params.sessionKey,
      expires_at: params.expiresAt,
      allowances: params.allowances,
    },
  };
}

export async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json()) as T | { error?: string };

  if (!response.ok) {
    const message = (data as { error?: string }).error ?? "Request failed";
    throw new Error(message);
  }

  return data as T;
}
