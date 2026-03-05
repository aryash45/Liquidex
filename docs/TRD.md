# DeFi Sentinel — Technical Requirements Document (TRD) v2

## 1. Architecture Overview

```mermaid
graph TB
    subgraph "Frontend · Next.js 15"
        UI[Dashboard UI]
        Chat[AI Chat Panel]
        WC[wagmi v2 + RainbowKit]
    end

    subgraph "Backend · Node.js + Express"
        API[REST API Routes]
        Monitor[Block Monitor Service]
        AlertEngine[Alert Engine]
        AIRoute[AI Chat Route]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL · Prisma)]
        Redis[(Redis · Cache)]
    end

    subgraph "External"
        RPC[Alchemy RPC + WebSocket]
        AavePool[Aave V3 Pool Contract]
        Chainlink[Chainlink Oracles]
        Groq[Groq LLM API]
        TG[Telegram Bot API]
    end

    UI --> API
    Chat --> AIRoute
    WC --> RPC
    API --> PG
    API --> Redis
    Monitor --> RPC --> AavePool
    Monitor --> RPC --> Chainlink
    Monitor --> PG
    Monitor --> AlertEngine
    AlertEngine --> TG
    AIRoute --> Groq
    AIRoute --> PG
```

### Why a Backend?

- **24/7 offline alerts** — server monitors wallets while user sleeps
- **Health factor history** — store snapshots for charts (24h, 7d, 30d)
- **Multi-wallet tracking** — one server monitors all subscribed wallets
- **API key security** — Groq + Alchemy keys stay server-side
- **Portfolio credibility** — demonstrates full-stack engineering

---

## 2. Tech Stack

| Layer             | Technology                                   | Version      | Why                                    |
| ----------------- | -------------------------------------------- | ------------ | -------------------------------------- |
| **Frontend**      | Next.js 15                                   | 15.x         | App Router, React 19, Turbopack        |
| **Web3 (client)** | wagmi v2 + viem v2                           | latest       | Type-safe contract reads in browser    |
| **Wallet UI**     | RainbowKit v2                                | latest       | Polished wallet connect modal          |
| **Styling**       | Tailwind CSS 4                               | 4.x          | Utility-first CSS                      |
| **Charts**        | Recharts                                     | 2.x          | Lightweight React charting             |
| **Backend**       | Node.js + Express                            | 20 LTS + 4.x | REST API, background jobs              |
| **ORM**           | Prisma                                       | 6.x          | Type-safe DB access, migrations        |
| **Database**      | PostgreSQL                                   | 16           | Position history, alert configs, users |
| **Cache**         | Redis                                        | 7.x          | RPC response cache, rate limiting      |
| **AI/LLM**        | Groq SDK                                     | latest       | Llama 3.3 70B (~200ms TTFT)            |
| **Alerts**        | Telegram Bot API                             | —            | Offline push alerts                    |
| **Deployment**    | Vercel (frontend) + Railway/Render (backend) | —            | Edge + persistent server               |

---

## 3. Database Schema (Prisma)

```prisma
model User {
  id            String    @id @default(cuid())
  walletAddress String    @unique
  createdAt     DateTime  @default(now())
  alerts        Alert[]
  snapshots     Snapshot[]
  chatHistory   ChatMessage[]
}

model Alert {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  chain           String   // "ethereum" | "polygon" | "arbitrum"
  threshold       Float    @default(1.3)   // health factor threshold
  telegramChatId  String?  // null = browser push only
  enabled         Boolean  @default(true)
  lastTriggeredAt DateTime?
  createdAt       DateTime @default(now())
}

model Snapshot {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  chain           String
  healthFactor    Float
  totalCollateral Float    // USD
  totalDebt       Float    // USD
  blockNumber     BigInt
  timestamp       DateTime @default(now())

  @@index([userId, chain, timestamp])
}

model ChatMessage {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  role      String   // "user" | "assistant"
  content   String
  createdAt DateTime @default(now())
}
```

---

## 4. Backend API Routes

```
POST   /api/auth/register        # Register wallet address
GET    /api/positions/:address    # Get live Aave positions (cached)
GET    /api/history/:address      # Get health factor history (from DB)
POST   /api/alerts                # Create/update alert config
DELETE /api/alerts/:id            # Remove alert
POST   /api/chat                  # AI chat (Groq + position context)
GET    /api/health                # Server health check
```

---

## 5. Aave V3 Contract Integration

### 5.1 `Pool.getUserAccountData(address)` — Primary Data Source

```solidity
function getUserAccountData(address user) external view returns (
    uint256 totalCollateralBase,        // USD, 8 decimals
    uint256 totalDebtBase,              // USD, 8 decimals
    uint256 availableBorrowsBase,       // USD, 8 decimals
    uint256 currentLiquidationThreshold,// 4 decimals (8250 = 82.5%)
    uint256 ltv,                        // 4 decimals
    uint256 healthFactor                // 18 decimals (WAD). < 1e18 = liquidatable
);
```

### 5.2 Contract Addresses

| Chain    | Pool Address                                 | ChainId |
| -------- | -------------------------------------------- | ------- |
| Ethereum | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | 1       |
| Polygon  | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | 137     |
| Arbitrum | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | 42161   |

### 5.3 Liquidation Price Formula

```
liquidationPrice = totalDebtUSD / (collateralAmount × liquidationThreshold)
```

Example: 10 ETH ($25K) collateral, $15K debt, 82.5% threshold → liquidation at **$1,818** (27% drop).

---

## 6. Block Monitor Service (Backend)

The core background service that enables offline alerts:

```typescript
// services/monitor.ts — runs continuously on backend
async function monitorLoop() {
  const provider = new WebSocketProvider(process.env.WS_RPC_URL);

  provider.on('block', async (blockNumber) => {
    // 1. Get all wallets with active alerts
    const alerts = await prisma.alert.findMany({ where: { enabled: true } });

    // 2. Batch-read positions (with Redis cache, 12s TTL)
    for (const alert of alerts) {
      const position = await getPositionCached(alert.user.walletAddress, alert.chain);

      // 3. Store snapshot (every 5 min, not every block)
      if (shouldSnapshot(alert.userId)) {
        await prisma.snapshot.create({ data: { ... } });
      }

      // 4. Check threshold & fire alert
      if (position.healthFactor <= alert.threshold) {
        await sendTelegramAlert(alert, position);
        await prisma.alert.update({
          where: { id: alert.id },
          data: { lastTriggeredAt: new Date() }
        });
      }
    }
  });
}
```

---

## 7. AI Chat — RAG Pipeline

```mermaid
sequenceDiagram
    User->>Frontend: "Am I safe if ETH drops 30%?"
    Frontend->>Backend: POST /api/chat { message, wallet }
    Backend->>DB: Fetch position history
    Backend->>Chain: getUserAccountData (live)
    Backend->>Backend: Build context prompt
    Backend->>Groq: System prompt + context + question
    Groq-->>Backend: AI response
    Backend->>DB: Store chat message
    Backend-->>Frontend: { response }
```

System prompt injects the user's **real on-chain data** so the LLM never hallucinates numbers.

---

## 8. Project Structure

```
guardian-forge/
├── frontend/                       # Next.js 15
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Landing page
│   │   ├── dashboard/page.tsx      # Main dashboard
│   │   ├── components/
│   │   │   ├── HealthGauge.tsx
│   │   │   ├── PositionTable.tsx
│   │   │   ├── LiquidationBar.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   └── AlertConfig.tsx
│   │   ├── hooks/
│   │   │   ├── useAavePositions.ts
│   │   │   └── useLiquidationPrices.ts
│   │   ├── lib/
│   │   │   ├── contracts.ts        # ABIs + addresses
│   │   │   ├── chains.ts
│   │   │   ├── math.ts             # WAD/RAY utilities
│   │   │   └── api.ts              # Backend API client
│   │   ├── providers.tsx
│   │   └── globals.css
│   ├── public/
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── backend/                        # Node.js + Express
│   ├── src/
│   │   ├── index.ts                # Express server entry
│   │   ├── routes/
│   │   │   ├── positions.ts
│   │   │   ├── alerts.ts
│   │   │   ├── chat.ts
│   │   │   └── history.ts
│   │   ├── services/
│   │   │   ├── monitor.ts          # Block listener + alert engine
│   │   │   ├── aave.ts             # Aave contract reads
│   │   │   └── telegram.ts         # Telegram bot service
│   │   ├── lib/
│   │   │   ├── prisma.ts           # Prisma client
│   │   │   ├── redis.ts            # Redis client
│   │   │   └── groq.ts             # Groq client
│   │   └── utils/
│   │       └── math.ts             # DeFi math (shared)
│   ├── prisma/
│   │   └── schema.prisma
│   ├── .env
│   ├── tsconfig.json
│   └── package.json
│
├── .gitignore
├── README.md
└── LICENSE
```

---

## 9. Environment Variables

### Frontend (`frontend/.env.local`)

```bash
NEXT_PUBLIC_ALCHEMY_KEY=            # Public — wagmi uses in browser
NEXT_PUBLIC_WALLETCONNECT_ID=       # WalletConnect project ID
NEXT_PUBLIC_API_URL=http://localhost:3001  # Backend URL
```

### Backend (`backend/.env`)

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/defi_sentinel

# Redis
REDIS_URL=redis://localhost:6379

# RPC (server-side, not rate-limited by browser)
ALCHEMY_RPC_ETH=https://eth-mainnet.g.alchemy.com/v2/KEY
ALCHEMY_WS_ETH=wss://eth-mainnet.g.alchemy.com/v2/KEY
ALCHEMY_RPC_POLYGON=https://polygon-mainnet.g.alchemy.com/v2/KEY

# AI
GROQ_API_KEY=gsk_...

# Alerts
TELEGRAM_BOT_TOKEN=

# Server
PORT=3001
```

---

## 10. Build Order

| Step | What                                                           | Time   |
| ---- | -------------------------------------------------------------- | ------ |
| 1    | Init Next.js 15 frontend + Tailwind + wagmi                    | 30 min |
| 2    | Init Express backend + Prisma + Redis                          | 30 min |
| 3    | Build `useAavePositions` hook + backend `/api/positions`       | 1 hr   |
| 4    | Build dashboard UI: HealthGauge, PositionTable, LiquidationBar | 2 hr   |
| 5    | Build block monitor service + alert engine                     | 1 hr   |
| 6    | Build AI chat route + ChatPanel component                      | 1 hr   |
| 7    | Landing page + polish                                          | 1 hr   |
| 8    | Deploy: Vercel (frontend) + Railway (backend)                  | 30 min |

---

## 11. Verification Plan

| Check                      | Method                                                   |
| -------------------------- | -------------------------------------------------------- |
| TypeScript compiles        | `tsc --noEmit` on both frontend + backend                |
| Frontend builds            | `npx next build`                                         |
| Health factor accuracy     | Compare with Aave official UI for same wallet            |
| Liquidation price accuracy | Manual calculation vs app output                         |
| AI uses real data          | Ask "what's my health factor?" → verify it matches       |
| Offline alerts fire        | Set threshold above current HF → verify Telegram message |
| History chart renders      | Wait 30 min → verify snapshots in DB and chart           |
