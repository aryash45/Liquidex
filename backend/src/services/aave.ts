import { formatUnits } from "viem";
import { getClient, AAVE_POOL_ADDRESSES, type SupportedChain } from "../lib/chains.js";
import { cached } from "../lib/redis.js";

// ── Aave V3 Pool ABI (minimal — only what we need) ──────────────────────────

const POOL_ABI = [
  {
    name: "getUserAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserPosition {
  chain: SupportedChain;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  availableBorrowsUSD: number;
  currentLiquidationThreshold: number; // e.g. 0.825 = 82.5%
  ltv: number; // e.g. 0.78 = 78%
  healthFactor: number; // < 1.0 = liquidatable
  hasPosition: boolean;
}

// ── Core: Read User Position from Aave V3 ────────────────────────────────────

export async function getUserPosition(
  walletAddress: `0x${string}`,
  chain: SupportedChain
): Promise<UserPosition> {
  const cacheKey = `pos:${chain}:${walletAddress.toLowerCase()}`;

  return cached<UserPosition>(cacheKey, 12, async () => {
    const client = getClient(chain);
    const poolAddress = AAVE_POOL_ADDRESSES[chain];

    const data = await client.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: "getUserAccountData",
      args: [walletAddress],
    });

    const [
      totalCollateralBase,
      totalDebtBase,
      availableBorrowsBase,
      currentLiquidationThreshold,
      ltv,
      healthFactor,
    ] = data;

    // Aave V3 base currency = USD with 8 decimals
    const totalCollateralUSD = Number(formatUnits(totalCollateralBase, 8));
    const totalDebtUSD = Number(formatUnits(totalDebtBase, 8));
    const availableBorrowsUSD = Number(formatUnits(availableBorrowsBase, 8));

    // Threshold and LTV are in basis points (4 decimals)
    const liqThreshold = Number(currentLiquidationThreshold) / 10000;
    const ltvRatio = Number(ltv) / 10000;

    // Health factor is in WAD (18 decimals)
    // If no debt, Aave returns MaxUint256 — we cap at 999
    const hf = totalDebtUSD === 0
      ? 999
      : Number(formatUnits(healthFactor, 18));

    return {
      chain,
      totalCollateralUSD,
      totalDebtUSD,
      availableBorrowsUSD,
      currentLiquidationThreshold: liqThreshold,
      ltv: ltvRatio,
      healthFactor: Math.min(hf, 999),
      hasPosition: totalCollateralUSD > 0 || totalDebtUSD > 0,
    };
  });
}

// ── Multi-chain: Get positions across all chains ─────────────────────────────

export async function getAllPositions(
  walletAddress: `0x${string}`
): Promise<UserPosition[]> {
  const chains: SupportedChain[] = ["ethereum", "polygon", "arbitrum"];

  const results = await Promise.allSettled(
    chains.map((chain) => getUserPosition(walletAddress, chain))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<UserPosition> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((p) => p.hasPosition);
}

// ── Liquidation Price Calculator ─────────────────────────────────────────────

export interface LiquidationInfo {
  chain: SupportedChain;
  healthFactor: number;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  liquidationThreshold: number;
  /** % drop in collateral value that triggers liquidation */
  percentDropToLiquidation: number;
  /** USD value of collateral at liquidation point */
  collateralAtLiquidation: number;
}

export function calculateLiquidationInfo(position: UserPosition): LiquidationInfo {
  const { totalCollateralUSD, totalDebtUSD, currentLiquidationThreshold, chain, healthFactor } = position;

  // Collateral value at which HF = 1.0
  // HF = (collateral × liqThreshold) / debt
  // 1.0 = (collateral_liq × liqThreshold) / debt
  // collateral_liq = debt / liqThreshold
  const collateralAtLiquidation = currentLiquidationThreshold > 0
    ? totalDebtUSD / currentLiquidationThreshold
    : 0;

  const percentDropToLiquidation = totalCollateralUSD > 0
    ? ((totalCollateralUSD - collateralAtLiquidation) / totalCollateralUSD) * 100
    : 0;

  return {
    chain,
    healthFactor,
    totalCollateralUSD,
    totalDebtUSD,
    liquidationThreshold: currentLiquidationThreshold,
    percentDropToLiquidation: Math.max(0, percentDropToLiquidation),
    collateralAtLiquidation,
  };
}
