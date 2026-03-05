import { createPublicClient, http, type Chain } from "viem";
import { mainnet, polygon, arbitrum } from "viem/chains";

// ── Supported Chains ──────────────────────────────────────────────────────────

export type SupportedChain = "ethereum" | "polygon" | "arbitrum";

export const CHAINS: Record<SupportedChain, Chain> = {
  ethereum: mainnet,
  polygon: polygon,
  arbitrum: arbitrum,
};

// ── RPC URLs ──────────────────────────────────────────────────────────────────

const RPC_URLS: Record<SupportedChain, string> = {
  ethereum: process.env.ALCHEMY_RPC_ETH || "https://eth.llamarpc.com",
  polygon: process.env.ALCHEMY_RPC_POLYGON || "https://polygon.llamarpc.com",
  arbitrum: process.env.ALCHEMY_RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
};

// ── Aave V3 Pool Addresses ───────────────────────────────────────────────────

export const AAVE_POOL_ADDRESSES: Record<SupportedChain, `0x${string}`> = {
  ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
};

// ── Viem Public Clients (1 per chain) ────────────────────────────────────────

const clients: Partial<Record<SupportedChain, ReturnType<typeof createPublicClient>>> = {};

export function getClient(chain: SupportedChain) {
  if (!clients[chain]) {
    clients[chain] = createPublicClient({
      chain: CHAINS[chain],
      transport: http(RPC_URLS[chain]),
      batch: { multicall: true },
    });
  }
  return clients[chain]!;
}
