# DeFi Sentinel — Product Requirements Document (PRD)

## 1. Product Vision

**One-liner:** Connect your wallet. Know exactly when you'll get liquidated. Ask AI what to do.

DeFi Sentinel is a real-time DeFi position risk monitor with an AI-powered advisor. It reads a user's lending positions directly from on-chain smart contracts (starting with Aave V3), calculates liquidation distances, and provides actionable AI-driven recommendations via natural language chat.

---

## 2. Problem Statement

DeFi users with leveraged lending positions lose billions of dollars annually to liquidations they could have prevented:

- **$2.5B+ liquidated** historically on Aave + Compound alone
- **$19B wiped out** in a single day (October 2025)
- Users must manually check health factors across multiple protocols
- No existing tool combines real-time alerts with AI-powered "what should I do?" guidance

### Why Existing Solutions Fall Short

| Tool          | What It Does         | What It Misses                           |
| ------------- | -------------------- | ---------------------------------------- |
| DeBank/Zapper | Portfolio viewing    | No liquidation-specific alerts, no AI    |
| Aave UI       | Single-protocol view | No cross-protocol, no alerts, no advice  |
| DeFi Saver    | Automated protection | Complex UX, no AI chat, power-users only |

**Our wedge:** Simple dashboard + AI advisor that tells you _what to do_, not just _what happened_.

---

## 3. Target Users

### Primary: "DeFi Borrowers" (~5M+ globally)

- Have active lending positions on Aave, Compound, or similar
- Worry about liquidation during sleep or market volatility
- Range from $1K to $500K in collateral
- Want plain-English guidance, not raw numbers

### Secondary: "DeFi Curious"

- Hold crypto but haven't tried lending yet
- Would use the tool to understand risk before entering positions

---

## 4. Feature Requirements

### P0 — Core (MVP)

#### FR-001: Wallet Connection & Position Reading

- Connect via RainbowKit (MetaMask, WalletConnect, Coinbase Wallet)
- Read user positions directly from Aave V3 Pool contract (`getUserAccountData`)
- Display: total collateral (USD), total debt (USD), health factor, available borrows
- Support chains: Ethereum Mainnet, Polygon, Arbitrum

#### FR-002: Health Factor Dashboard

- Large, prominent health factor gauge (color-coded: green > 2.0, yellow 1.5–2.0, orange 1.2–1.5, red < 1.2)
- Individual position breakdown: asset, amount, USD value, LTV, liquidation threshold
- Net APY display (earning vs paying)

#### FR-003: Liquidation Price Calculator

- For each collateral asset, calculate: "If [ASSET] drops to $X, you will be liquidated"
- Show percentage drop required: "ETH needs to fall 34% from current price"
- Visual price distance bar

#### FR-004: AI Risk Advisor (Groq Chat)

- Chat interface where user types questions about their positions
- AI receives structured context: user's actual on-chain positions, current prices, health factor
- Example prompts the AI can handle:
  - "Am I safe if ETH drops 30%?"
  - "What should I repay first to improve my health factor?"
  - "Explain my risk in simple terms"
- Uses Groq (Llama 3.3 70B) for fast inference

### P1 — Alerts & Engagement

#### FR-005: Threshold Alerts

- User sets custom health factor threshold (default: 1.3)
- Browser push notification when health factor crosses threshold
- Optional: Telegram bot integration

#### FR-006: Real-Time Price Monitoring

- WebSocket connection to blockchain for live oracle price updates
- Health factor recalculates on every new block
- Visual pulse animation when values change

#### FR-007: Position History

- Track health factor over time (24h, 7d, 30d chart)
- Show historical liquidation events on the user's address

### P2 — Growth

#### FR-008: Multi-Protocol Support

- Add Compound V3, Morpho, Spark (MakerDAO)
- Unified cross-protocol health view

#### FR-009: Portfolio Simulation

- "What if" simulator: "What happens if I borrow $5K more USDC?"
- Drag sliders to simulate price changes and see health factor impact

---

## 5. User Flows

### Flow 1: First Visit

1. User lands on homepage → sees hero with value prop
2. Clicks "Connect Wallet" → RainbowKit modal
3. App reads on-chain positions → displays dashboard
4. If no positions: shows "You have no active lending positions" with educational content

### Flow 2: Daily Check

1. User opens app (bookmarked) → auto-connects wallet
2. Sees health factor gauge + liquidation prices at a glance
3. If concerned → opens AI chat: "Should I be worried?"
4. AI analyzes position and gives plain-English answer

### Flow 3: Market Crash

1. User receives browser notification: "⚠️ Health Factor dropped to 1.15"
2. Opens app → sees red gauge, specific liquidation prices
3. Asks AI: "What's the cheapest way to fix this?"
4. AI recommends: "Repay 200 USDC to bring HF back to 1.5"

---

## 6. Success Metrics

| Metric                   | Target (3 months) |
| ------------------------ | ----------------- |
| Wallets connected        | 500+              |
| Daily active users       | 50+               |
| AI chat messages/day     | 200+              |
| Alert subscriptions      | 100+              |
| Average session duration | > 2 minutes       |

---

## 7. Monetization (Future)

- **Free tier:** Dashboard + 1 alert threshold
- **Pro ($9/month):** Unlimited alerts, AI chat, multi-chain, Telegram bot
- **API tier ($49/month):** Programmatic access for funds/protocols

---

## 8. Non-Goals (Explicitly Out of Scope)

- ❌ Executing transactions on behalf of users (no auto-repay/auto-deleverage)
- ❌ Writing our own smart contracts
- ❌ Supporting centralized exchange positions
- ❌ Token or governance mechanism
