import { NextResponse } from "next/server";
import { z } from "zod";
import { encodeFunctionData, getAddress } from "viem";
import { custodyAbi } from "@erc7824/nitrolite/dist/abis/generated";
import { gameStore } from "@/server/game-store";
import { executeUnifiedWithdrawToOnchain } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  actionId: z.string().min(1),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/)
    .optional(),
  signatures: z.array(z.string().regex(/^0x[a-fA-F0-9]+$/)).min(1).optional(),
  prepared: z
    .object({
      wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      flow: z.enum(["withdraw", "open_channel"]),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      amountBaseUnits: z.string().regex(/^\d+$/),
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      custodyAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      requestPayloads: z.array(
        z.tuple([
          z.number(),
          z.string(),
          z.record(z.string(), z.unknown()),
          z.number().optional(),
        ]),
      ),
      requestMethods: z.array(z.enum(["create_channel", "resize_channel"])).optional(),
      perChannelAmountsBaseUnits: z.array(z.string().regex(/^\d+$/)),
    })
    .optional(),
}).refine((value) => Boolean(value.signature) || Boolean(value.signatures?.length), {
  message: "signature or signatures is required",
});

function serializeError(error: unknown): Record<string, unknown> {
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const wallet = getAddress(payload.wallet);
    const participantAuth = gameStore.getParticipantSessionAuth(wallet);

    if (!participantAuth) {
      return NextResponse.json(
        { error: "Missing session key authorization for this wallet. Join lobby to authorize first." },
        { status: 400 },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (participantAuth.expiresAt <= now) {
      return NextResponse.json(
        { error: "Session key authorization expired. Re-authorize wallet and try again." },
        { status: 400 },
      );
    }
    if (!participantAuth.jwtToken) {
      return NextResponse.json(
        { error: "Participant authentication required. Re-authorize wallet and try again." },
        { status: 400 },
      );
    }

    const execution = await executeUnifiedWithdrawToOnchain({
      actionId: payload.actionId,
      wallet,
      sessionKey: participantAuth.sessionKey,
      authJwtToken: participantAuth.jwtToken,
      preparedAction: payload.prepared,
      signature: payload.signature as `0x${string}` | undefined,
      signatures: payload.signatures as `0x${string}`[] | undefined,
    });

    const txs = execution.operations.flatMap((operation) => {
      const candidate = {
        intent: operation.state.intent,
        version: BigInt(operation.state.version),
        data: operation.state.stateData,
        allocations: operation.state.allocations.map((allocation) => ({
          destination: allocation.destination,
          token: allocation.token,
          amount: BigInt(allocation.amount),
        })),
        sigs: [operation.participantSignature, operation.serverSignature] as `0x${string}`[],
      };

      if (operation.kind === "create") {
        // `create_channel` is executed on Yellow RPC path for this test flow.
        // Skip generating on-chain `create` tx to avoid duplicate/invalid channel creation attempts.
        return [];
      }

      const txData = encodeFunctionData({
        abi: custodyAbi,
        functionName: "resize",
        args: [operation.channelId, candidate, []],
      });

      return [{
        kind: operation.kind,
        channelId: operation.channelId,
        amountBaseUnits: operation.amountBaseUnits,
        to: execution.custodyAddress,
        data: txData,
      }];
    });

    return NextResponse.json({
      actionId: execution.actionId,
      flow: execution.flow,
      wallet: execution.wallet,
      amount: execution.amount,
      amountBaseUnits: execution.amountBaseUnits,
      tokenAddress: execution.tokenAddress,
      custodyAddress: execution.custodyAddress,
      txCount: txs.length,
      txs,
      tx: txs[0] ?? null,
    });
  } catch (error) {
    console.error("[api/yellow/withdraw-onchain/execute] failed", {
      ...serializeError(error),
    });

    const message = error instanceof Error ? error.message : "Failed to execute on-chain withdrawal";
    const lower = message.toLowerCase();
    const status =
      lower.includes("expired") ||
      lower.includes("missing") ||
      lower.includes("invalid") ||
      lower.includes("not found")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
