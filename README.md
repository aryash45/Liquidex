# DeFi Sentinel

**Real-time DeFi position monitoring with AI-powered risk analysis.**

Connect your wallet → see your Aave V3 health factor → get AI advice on your liquidation risk.

![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Express](https://img.shields.io/badge/Express-4-green)

### 📖 Documentation

- **[Dev Log](./DEVLOG.md)** — Architecture decisions, pivot story, AI failure points, and what I'd do differently
- **[PRD](./docs/PRD.md)** — Product Requirements Document (feature specs, user flows, success metrics)
- **[TRD](./docs/TRD.md)** — Technical Requirements Document (system design, Aave V3 integration, database schema)

---

## The Problem

DeFi users with leveraged lending positions lose **billions** annually to preventable liquidations:

- **$2.5B+** liquidated on Aave & Compound historically
- **$19B** wiped out in a single day (October 2025)
- No tool combines real-time alerts with AI-powered "what should I do?" guidance

## The Solution

DeFi Sentinel reads your positions **directly from on-chain contracts** (not an API middleman), calculates your exact liquidation price, and lets you ask an AI advisor what to do — using your **real numbers**, not hallucinated data.

---

## Architecture

```
Frontend (Next.js 16)  ←→  Backend (Express)  ←→  Aave V3 Contracts (Mainnet)
                                  ↓
                            PostgreSQL + Redis
                                  ↓
                            Groq LLM + Telegram Alerts
```

| Layer    | Stack                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| Frontend | Next.js 16 · React 19 · wagmi v2 · viem v2 · RainbowKit · Tailwind 4 · Recharts |
| Backend  | Express · Prisma ORM · PostgreSQL · Redis · Groq SDK (Llama 3.3 70B)            |
| Chains   | Ethereum · Polygon · Arbitrum (Aave V3 Pool contracts)                          |

---

## Features (V1)

- **Health Factor Gauge** — animated circular visualization, color-coded by risk level
- **Multi-Chain Position Table** — collateral, debt, LTV, and health factor per chain
- **Liquidation Distance Bars** — shows exactly how much your collateral must drop before liquidation
- **AI Risk Advisor** — chat powered by Groq with your real on-chain data injected into context
- **Background Monitor** — checks all subscribed wallets every 30s, stores snapshots every 5min
- **Telegram Alerts** — fires when health factor crosses your threshold (while you sleep)

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL ([Supabase free tier](https://supabase.com) works)
- Redis (optional — gracefully degrades without it)

### Backend

```bash
cd backend
cp .env.example .env
# Fill in: DATABASE_URL, GROQ_API_KEY, ALCHEMY_RPC_ETH
npm install
npx prisma db push
npm run dev                # → http://localhost:3001
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in: NEXT_PUBLIC_WALLETCONNECT_ID, NEXT_PUBLIC_ALCHEMY_KEY
npm install
npm run dev                # → http://localhost:3000
```

### Verify

```bash
curl http://localhost:3001/api/health
# → {"status":"ok","service":"defi-sentinel-backend"}

curl http://localhost:3001/api/positions/0xYOUR_WALLET
# → {"positions":[...],"liquidations":[...]}
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable               | Required | Description                                 |
| ---------------------- | -------- | ------------------------------------------- |
| `DATABASE_URL`         | ✅       | PostgreSQL connection string                |
| `GROQ_API_KEY`         | ✅       | [Groq Console](https://console.groq.com)    |
| `ALCHEMY_RPC_ETH`      | ✅       | [Alchemy](https://alchemy.com) Ethereum RPC |
| `ALCHEMY_RPC_POLYGON`  | Optional | Polygon RPC (falls back to public)          |
| `ALCHEMY_RPC_ARBITRUM` | Optional | Arbitrum RPC (falls back to public)         |
| `REDIS_URL`            | Optional | Redis cache (degrades gracefully)           |
| `TELEGRAM_BOT_TOKEN`   | Optional | [@BotFather](https://t.me/BotFather)        |

### Frontend (`frontend/.env.local`)

| Variable                       | Required | Description                                            |
| ------------------------------ | -------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_WALLETCONNECT_ID` | ✅       | [WalletConnect Cloud](https://cloud.walletconnect.com) |
| `NEXT_PUBLIC_ALCHEMY_KEY`      | Optional | Alchemy API key for browser RPC                        |
| `NEXT_PUBLIC_API_URL`          | Optional | Backend URL (default: `http://localhost:3001`)         |

---

## Project Structure

```
├── frontend/                 # Next.js 16 (App Router)
│   ├── app/
│   │   ├── page.tsx          # Landing page
│   │   ├── dashboard/page.tsx# Main dashboard
│   │   ├── components/       # HealthGauge, PositionTable, LiquidationBar, ChatPanel
│   │   ├── lib/api.ts        # Typed API client
│   │   └── providers.tsx     # wagmi + RainbowKit
│   └── package.json
│
├── backend/                  # Express API + background jobs
│   ├── src/
│   │   ├── index.ts          # Server entry
│   │   ├── routes/           # positions, alerts, chat, history
│   │   ├── services/         # aave, monitor, telegram
│   │   └── lib/              # prisma, redis, groq, chains
│   ├── prisma/schema.prisma
│   └── package.json
│
├── README.md
└── LICENSE
```

---

## API Endpoints

| Method   | Route                     | Description                               |
| -------- | ------------------------- | ----------------------------------------- |
| `GET`    | `/api/positions/:address` | Live Aave V3 positions across 3 chains    |
| `POST`   | `/api/chat`               | AI advisor (Groq + real position context) |
| `POST`   | `/api/alerts`             | Create health factor alert                |
| `GET`    | `/api/alerts/:address`    | Get alerts for a wallet                   |
| `DELETE` | `/api/alerts/:id`         | Delete an alert                           |
| `GET`    | `/api/history/:address`   | Health factor snapshots (24h/7d/30d)      |
| `GET`    | `/api/health`             | Server health check                       |

---

## How the AI Advisor Works

When you ask a question, the backend:

1. Reads your **live on-chain position** from Aave V3 Pool contracts
2. Calculates your **liquidation prices** and **health factor**
3. Formats this as structured context for the LLM
4. Sends it to Groq (Llama 3.3 70B) with strict rules: **use only real numbers, never fabricate data**
5. Returns actionable advice like: _"Repay $200 USDC to improve your health factor from 1.15 to 1.52"_

---

## License

MIT
