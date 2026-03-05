import { Router, type Request, type Response } from "express";
import { groq, AI_MODEL } from "../lib/groq.js";
import { prisma } from "../lib/prisma.js";
import { getAllPositions, calculateLiquidationInfo } from "../services/aave.js";
import { isAddress } from "viem";

const router = Router();

// POST /api/chat — AI advisor chat with position context
router.post("/", async (req: Request, res: Response) => {
  const { message, walletAddress } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (!walletAddress || !isAddress(walletAddress)) {
    res.status(400).json({ error: "Valid wallet address is required" });
    return;
  }

  try {
    // 1. Fetch live position data for context
    const positions = await getAllPositions(walletAddress as `0x${string}`);
    const liquidations = positions.map(calculateLiquidationInfo);

    // 2. Build structured context
    const positionContext = positions.length > 0
      ? positions.map((p, i) => {
          const liq = liquidations[i];
          return [
            `Chain: ${p.chain}`,
            `  Health Factor: ${p.healthFactor.toFixed(4)}`,
            `  Total Collateral: $${p.totalCollateralUSD.toFixed(2)}`,
            `  Total Debt: $${p.totalDebtUSD.toFixed(2)}`,
            `  Available Borrows: $${p.availableBorrowsUSD.toFixed(2)}`,
            `  Liquidation Threshold: ${(p.currentLiquidationThreshold * 100).toFixed(1)}%`,
            `  LTV: ${(p.ltv * 100).toFixed(1)}%`,
            `  Drop to Liquidation: ${liq.percentDropToLiquidation.toFixed(1)}%`,
            `  Collateral at Liquidation: $${liq.collateralAtLiquidation.toFixed(2)}`,
          ].join("\n");
        }).join("\n\n")
      : "No active DeFi lending positions found on Aave V3.";

    const systemPrompt = `You are DeFi Sentinel AI, a risk advisor for DeFi lending positions on Aave V3.

USER'S LIVE ON-CHAIN POSITION DATA (as of this moment):
${positionContext}

RULES:
1. ALWAYS use the user's ACTUAL numbers above. Never fabricate data.
2. When asked about price scenarios, calculate the impact mathematically.
3. Give specific, actionable recommendations (e.g., "Repay $X of USDC to improve HF to Y").
4. If health factor is below 1.2, lead with URGENCY.
5. If health factor is above 2.0, reassure the user but mention what would change it.
6. If no positions found, explain what Aave V3 is and how to get started.
7. Explain in plain English. Avoid jargon unless asked.
8. Keep responses concise — under 200 words unless the user asks for detail.
9. Never recommend specific tokens to buy. Focus on risk management.`;

    // 3. Call Groq
    const completion = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const aiResponse = completion.choices[0]?.message?.content || "I wasn't able to generate a response. Please try again.";

    // 4. Store chat history
    try {
      const user = await prisma.user.upsert({
        where: { walletAddress: walletAddress.toLowerCase() },
        update: {},
        create: { walletAddress: walletAddress.toLowerCase() },
      });

      await prisma.chatMessage.createMany({
        data: [
          { userId: user.id, role: "user", content: message },
          { userId: user.id, role: "assistant", content: aiResponse },
        ],
      });
    } catch {
      // DB failure shouldn't block AI response
      console.warn("[Chat] Failed to store chat history");
    }

    res.json({
      response: aiResponse,
      context: {
        positionsFound: positions.length,
        chains: positions.map((p) => p.chain),
      },
    });
  } catch (err) {
    console.error("[Chat] Error:", err);
    res.status(500).json({ error: "AI advisor is currently unavailable" });
  }
});

export default router;
