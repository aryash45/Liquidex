import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { isAddress } from "viem";

const router = Router();

// GET /api/history/:address — Get health factor history
router.get("/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain, period } = req.query;

  if (!address || !isAddress(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  // Calculate time window
  const periodHours: Record<string, number> = {
    "24h": 24,
    "7d": 168,
    "30d": 720,
  };

  const hours = periodHours[(period as string) || "24h"] || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      res.json({ snapshots: [] });
      return;
    }

    const where: any = {
      userId: user.id,
      timestamp: { gte: since },
    };

    if (chain && typeof chain === "string") {
      where.chain = chain;
    }

    const snapshots = await prisma.snapshot.findMany({
      where,
      orderBy: { timestamp: "asc" },
      select: {
        chain: true,
        healthFactor: true,
        totalCollateral: true,
        totalDebt: true,
        timestamp: true,
      },
    });

    res.json({ snapshots, period: period || "24h" });
  } catch (err) {
    console.error("[History] Error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
