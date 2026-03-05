const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  message: string
): Promise<boolean> {
  if (!botToken || !chatId) return false;

  try {
    const url = `${TELEGRAM_API}${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      console.error("[Telegram] Failed to send:", await response.text());
      return false;
    }

    console.log(`[Telegram] Alert sent to ${chatId}`);
    return true;
  } catch (err) {
    console.error("[Telegram] Error:", err);
    return false;
  }
}

export function formatAlertMessage(
  walletAddress: string,
  chain: string,
  healthFactor: number,
  threshold: number,
  totalCollateralUSD: number,
  totalDebtUSD: number
): string {
  const emoji = healthFactor < 1.0 ? "🔴" : healthFactor < 1.2 ? "🟠" : "🟡";

  return [
    `${emoji} *DeFi Sentinel Alert*`,
    ``,
    `Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
    `Chain: *${chain}*`,
    `Health Factor: *${healthFactor.toFixed(4)}* (threshold: ${threshold})`,
    `Collateral: $${totalCollateralUSD.toFixed(2)}`,
    `Debt: $${totalDebtUSD.toFixed(2)}`,
    ``,
    healthFactor < 1.0
      ? `⚠️ *LIQUIDATION IMMINENT — Take action NOW*`
      : `⚠️ Your position is approaching liquidation. Consider adding collateral or repaying debt.`,
  ].join("\n");
}
