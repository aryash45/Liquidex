import { Router, type Request, type Response } from "express";
import { getAllPositions, calculateLiquidationInfo, getUserPosition } from "../services/aave.js";
import { isAddress } from "viem";

const router = Router();

// GET /api/positions/:address — Get all Aave V3 positions across chains
router.get("/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain } = req.query;

  if (!address || !isAddress(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  try {
    if (chain && typeof chain === "string") {
      // Single chain query
      const validChains = ["ethereum", "polygon", "arbitrum"];
      if (!validChains.includes(chain)) {
        res.status(400).json({ error: `Invalid chain: ${chain}. Must be one of: ${validChains.join(", ")}` });
        return;
      }
      const position = await getUserPosition(address as `0x${string}`, chain as any);
      const liquidation = calculateLiquidationInfo(position);
      res.json({ positions: [position], liquidations: [liquidation] });
      return;
    }

    // Multi-chain query (default)
    const positions = await getAllPositions(address as `0x${string}`);
    const liquidations = positions.map(calculateLiquidationInfo);

    res.json({ positions, liquidations });
  } catch (err) {
    console.error("[Positions] Error:", err);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

export default router;
