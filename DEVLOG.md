# Dev Log — DeFi Sentinel

This document records the key architectural decisions, pivots, and AI failure points during development. It's written to show the **human-in-the-loop** process — where I directed the AI, where I had to override it, and why.

---

## The Pivot: GuardianForge → DeFi Sentinel

### What GuardianForge Was

I originally built **GuardianForge** — a wallet guardian recovery system with:

- A Solidity smart contract for social recovery (guardians vote to recover your wallet)
- An AI agent monitoring wallet transactions for anomalies
- A frontend for managing guardians and approving recovery requests

### Why I Killed It

After building the entire P0 (event-driven AI agent, 5 frontend components, smart contract integration), I ran an honest assessment:

1. **Wrong user timing.** Users only feel the pain _after_ being hacked — by then it's too late. The security product had no daily engagement loop.
2. **Testnet trap.** The smart contract required a professional audit (~$30–80K) before mainnet deployment. Without mainnet, it was just a demo.
3. **Narrow market.** Only users who already understood smart contract wallets would adopt it — maybe 500K people globally.

I validated through web research that DeFi liquidations wiped out **$19B in a single day** (October 2025) and that no tool combined real-time alerts with AI-powered guidance. The market gap was clear and the pain was daily, not reactive.

**Decision:** Pivot to a tool where users feel value every day, not just during emergencies.

---

## Architecture Decisions

### Why Direct Contract Reads (Not API Aggregators)

I could have used DeBank or Zapper's APIs to pull position data. I chose to read directly from Aave V3's `Pool.getUserAccountData()` instead.

**Reasoning:**

- **Portfolio credibility.** Reading raw contract state and parsing WAD/RAY math (18-decimal and 27-decimal fixed-point arithmetic) demonstrates real EVM knowledge.
- **No API dependency.** Third-party APIs can change, rate-limit, or shut down. The Aave V3 Pool contract is immutable on-chain.
- **Accuracy.** Aggregator APIs may have 5–30s lag. Direct reads give exact block-level state — critical during market crashes when seconds matter.

### Why Express Backend (Not Serverless)

The initial architecture was **zero backend** — all on-chain reads from the browser via Next.js Server Actions. I caught this flaw during planning:

**Problem:** The core value prop is _"we alert you while you sleep."_ You can't run a background monitoring loop from a browser tab that's closed. Server Actions also cold-start on Vercel, adding latency.

**Decision:** Add a persistent Express server with:

- Background monitor running every 30s (not possible serverless)
- PostgreSQL for health factor history (needed for charts)
- Redis for caching RPC responses (12s TTL to avoid rate limits)

### Why Groq Over OpenAI

- **Speed:** Groq serves Llama 3.3 70B at ~200ms time-to-first-token vs 800ms+ for GPT-4o.
- **Cost:** Free tier for development. No billing surprises.
- **Privacy:** Position data stays in the prompt context only — no fine-tuning on user data.
- **Model quality:** Llama 3.3 70B handles structured financial reasoning well when given explicit constraints in the system prompt.

### Why wagmi v2 + viem v2 (Not ethers.js)

- **Type safety.** viem's TypeScript-first approach catches contract ABI mismatches at compile time.
- **Tree-shaking.** viem is ~35KB bundled vs ethers.js at ~120KB.
- **wagmi integration.** wagmi v2 is a thin wrapper around viem + TanStack Query — the same query cache handles both contract reads and UI state.

---

## Where the AI Failed (And I Intervened)

### 1. The "No Backend" Hallucination

When I asked the AI to design the architecture, it defaulted to an all-frontend design with Next.js Server Actions. It missed that **offline alerts are impossible without a persistent server.** I had to explicitly challenge this and redesign the architecture.

**Lesson:** AI optimizes for simplicity by default. Production systems require you to think about edge cases the AI won't surface.

### 2. TypeScript Readonly Tuple Cast

In the GuardianForge build, the AI generated a contract return type cast:

```typescript
// AI generated this:
const [triggeredAt, delay] = recoveryDetails as [bigint, bigint, ...any[]];

// TypeScript error: readonly tuple can't be cast to mutable
// I fixed it to:
const [triggeredAt, delay] = recoveryDetails as unknown as [
  bigint,
  bigint,
  ...unknown[],
];
```

wagmi v2 returns `readonly` tuples from `useReadContract`. The AI didn't account for this.

### 3. Aave WAD/RAY Precision

The AI initially used `Number(healthFactor)` to convert the health factor, which silently overflows for large BigInt values. I corrected it to:

```typescript
const hf = Number(formatUnits(healthFactor, 18)); // WAD = 18 decimals
```

Aave uses 3 different decimal scales: 8 (USD base), 4 (basis points for LTV), and 18 (WAD for health factor). The AI conflated them in the first pass.

### 4. Redis Graceful Degradation

The AI's initial Redis implementation would crash the server if Redis was unavailable. I redesigned the `cached()` helper to wrap Redis calls in try/catch and fall through to the direct fetcher — so the app works without Redis, just slower.

---

## PRD Evolution

The PRD went through 2 major versions:

1. **v1 (Frontend-only):** Zero backend. Direct contract reads from the browser. No alerts, no history.
2. **v2 (Full-stack):** Added Express backend, PostgreSQL, Redis, background monitor, and Telegram alerts after realizing the core value prop required a persistent server.

Both versions are preserved in the [`/docs`](./docs/) directory.

---

## What I'd Do Differently

1. **Start with the alert hook, not the dashboard.** The alert is the sticky feature. The dashboard is nice but doesn't create a habit.
2. **Add Compound V3 earlier.** Multi-protocol coverage is the real moat. Single-protocol tools are commoditized.
3. **Build the Telegram bot as the primary interface.** Many DeFi users live in Telegram. A bot that messages them directly would have higher engagement than a web dashboard.
