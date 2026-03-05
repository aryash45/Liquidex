import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { isAddress } from "viem";
import { z } from "zod";

const router = Router();

// ── Validation ───────────────────────────────────────────────────────────────

const CreateAlertSchema = z.object({
  walletAddress: z.string().refine(isAddress, "Invalid wallet address"),
  chain: z.enum(["ethereum", "polygon", "arbitrum"]),
  threshold: z.number().min(1.0).max(10.0).default(1.3),
  telegramChatId: z.string().optional(),
});

// POST /api/alerts — Create or update an alert
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { walletAddress, chain, threshold, telegramChatId } = parsed.data;

  try {
    // Upsert user
    const user = await prisma.user.upsert({
      where: { walletAddress: walletAddress.toLowerCase() },
      update: {},
      create: { walletAddress: walletAddress.toLowerCase() },
    });

    // Check if alert already exists for this user+chain
    const existing = await prisma.alert.findFirst({
      where: { userId: user.id, chain },
    });

    if (existing) {
      // Update existing
      const alert = await prisma.alert.update({
        where: { id: existing.id },
        data: { threshold, telegramChatId, enabled: true },
      });
      res.json({ alert, updated: true });
      return;
    }

    // Create new
    const alert = await prisma.alert.create({
      data: {
        userId: user.id,
        chain,
        threshold,
        telegramChatId,
      },
    });

    res.status(201).json({ alert, created: true });
  } catch (err) {
    console.error("[Alerts] Error:", err);
    res.status(500).json({ error: "Failed to create alert" });
  }
});

// GET /api/alerts/:address — Get all alerts for a wallet
router.get("/:address", async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!address || !isAddress(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
      include: { alerts: true },
    });

    res.json({ alerts: user?.alerts || [] });
  } catch (err) {
    console.error("[Alerts] Error:", err);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// DELETE /api/alerts/:id — Delete an alert
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.alert.delete({ where: { id } });
    res.json({ deleted: true });
  } catch (err) {
    console.error("[Alerts] Error:", err);
    res.status(500).json({ error: "Alert not found" });
  }
});

export default router;
