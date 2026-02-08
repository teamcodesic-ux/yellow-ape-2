import { NextResponse } from "next/server";
import { getPublicYellowConfig } from "@/server/yellow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getPublicYellowConfig();
    return NextResponse.json({ ...config, error: null });
  } catch (error) {
    const chainId = Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? 84532);

    return NextResponse.json({
      chainId,
      assetId: process.env.YELLOW_ASSET_ID ?? "ytest.usd",
      tokenAddress: null,
      tokenSymbol: process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "yUSDC",
      adminWallet: null,
      error: error instanceof Error ? error.message : "Unable to load Yellow token mapping",
    });
  }
}
