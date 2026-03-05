import { prisma } from "../lib/prisma.js";
import { getUserPosition, type SupportedChain } from "./aave.js";
import { sendTelegramAlert, formatAlertMessage } from "./telegram.js";

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
const lastSnapshotTime: Record<string, number> = {};

/**
 * Background monitoring service.
 * Periodically checks all active alerts and:
 * 1. Stores health factor snapshots (every 5 min)
 * 2. Fires alerts when thresholds are crossed
 */
export async function startMonitor() {
  console.log("[Monitor] Starting background position monitor...");

  const runCheck = async () => {
    try {
      const alerts = await prisma.alert.findMany({
        where: { enabled: true },
        include: { user: true },
      });

      if (alerts.length === 0) return;

      console.log(`[Monitor] Checking ${alerts.length} active alerts...`);

      for (const alert of alerts) {
        try {
          const position = await getUserPosition(
            alert.user.walletAddress as `0x${string}`,
            alert.chain as SupportedChain
          );

          if (!position.hasPosition) continue;

          // ── Store snapshot (throttled to every 5 min per user+chain) ──
          const snapshotKey = `${alert.userId}:${alert.chain}`;
          const lastSnapshot = lastSnapshotTime[snapshotKey] || 0;

          if (Date.now() - lastSnapshot >= SNAPSHOT_INTERVAL_MS) {
            const client = await import("../lib/chains.js").then((m) =>
              m.getClient(alert.chain as SupportedChain)
            );
            const blockNumber = await client.getBlockNumber();

            await prisma.snapshot.create({
              data: {
                userId: alert.userId,
                chain: alert.chain,
                healthFactor: position.healthFactor,
                totalCollateral: position.totalCollateralUSD,
                totalDebt: position.totalDebtUSD,
                blockNumber: blockNumber,
              },
            });

            lastSnapshotTime[snapshotKey] = Date.now();
          }

          // ── Check alert threshold ────────────────────────────────────
          if (position.healthFactor <= alert.threshold) {
            // Cooldown: don't spam — only alert once per hour
            const cooldownMs = 60 * 60 * 1000;
            const lastTriggered = alert.lastTriggeredAt?.getTime() || 0;

            if (Date.now() - lastTriggered < cooldownMs) continue;

            console.log(
              `[Monitor] ⚠️  Alert triggered for ${alert.user.walletAddress} on ${alert.chain}: HF=${position.healthFactor.toFixed(4)} <= ${alert.threshold}`
            );

            // Send Telegram alert
            if (alert.telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
              const message = formatAlertMessage(
                alert.user.walletAddress,
                alert.chain,
                position.healthFactor,
                alert.threshold,
                position.totalCollateralUSD,
                position.totalDebtUSD
              );

              await sendTelegramAlert(
                process.env.TELEGRAM_BOT_TOKEN,
                alert.telegramChatId,
                message
              );
            }

            // Update last triggered timestamp
            await prisma.alert.update({
              where: { id: alert.id },
              data: { lastTriggeredAt: new Date() },
            });
          }
        } catch (err) {
          console.error(
            `[Monitor] Error checking ${alert.user.walletAddress} on ${alert.chain}:`,
            err
          );
        }
      }
    } catch (err) {
      console.error("[Monitor] Error in check loop:", err);
    }
  };

  // Run immediately, then on interval
  await runCheck();
  setInterval(runCheck, CHECK_INTERVAL_MS);

  console.log(`[Monitor] Running every ${CHECK_INTERVAL_MS / 1000}s`);
}
