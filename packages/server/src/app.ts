import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {existsSync} from "node:fs";
import {toNodeHandler} from "better-auth/node";
import {auth} from "./auth.js";
import {db} from "./db/connection.js";
import {sql} from "drizzle-orm";
import recipeRoutes from "./routes/recipes.js";
import planRoutes from "./routes/plans.js";
import listRoutes from "./routes/lists.js";
import stapleRoutes from "./routes/staples.js";
import storeRoutes from "./routes/stores.js";
import discountRoutes from "./routes/discounts.js";
import setupRoutes from "./routes/setup.js";
import inviteRoutes from "./routes/invite.js";
import recoveryRoutes from "./routes/recovery.js";
import registerRoutes from "./routes/register.js";
import websiteRoutes from "./routes/websites.js";
import adminRoutes from "./routes/admin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.set("etag", false);
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});

// Auth rate limiter
app.set("trust proxy", 1); // trust first proxy
const authLimiter = rateLimit({
  windowMs: 10_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Mount Better Auth handler first (needs raw body)
app.all("/api/auth/*splat", authLimiter, toNodeHandler(auth));

// Then JSON parser for other routes
app.use(express.json());

// Routes
app.use("/api/setup", setupRoutes);
app.use("/api/invite", inviteRoutes);
app.use("/api/recovery", recoveryRoutes);
app.use("/api/register", registerRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/lists", listRoutes);
app.use("/api/staples", stapleRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/websites", websiteRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_req, res) => {
  try {
    db.run(sql`SELECT 1`);
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error", error: "Database unavailable" });
  }
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

// Serve client static files in production
const clientDist = join(__dirname, "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*splat", (_req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}

export default app;
