import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import positionsRouter from "./routes/positions.js";
import alertsRouter from "./routes/alerts.js";
import chatRouter from "./routes/chat.js";
import historyRouter from "./routes/history.js";
import { startMonitor } from "./services/monitor.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL
    : ["http://localhost:3000", "http://localhost:3001"],
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/positions", positionsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/history", historyRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "defi-sentinel-backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║    DeFi Sentinel Backend v1.0            ║
  ║    Port: ${PORT}                            ║
  ║    Env:  ${process.env.NODE_ENV || "development"}                  ║
  ╚══════════════════════════════════════════╝
  `);

  // Connect Redis (lazy)
  try {
    const { redis } = await import("./lib/redis.js");
    await redis.connect();
  } catch {
    console.warn("[Redis] Not available — running without cache");
  }

  // Start background monitor
  try {
    await startMonitor();
  } catch (err) {
    console.warn("[Monitor] Failed to start:", err);
  }
});

export default app;
