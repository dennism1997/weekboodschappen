import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { db } from "./db/connection.js";
import { sql } from "drizzle-orm";
import recipeRoutes from "./routes/recipes.js";
import planRoutes from "./routes/plans.js";
import listRoutes from "./routes/lists.js";
import stapleRoutes from "./routes/staples.js";
import storeRoutes from "./routes/stores.js";
import discountRoutes from "./routes/discounts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.set("etag", false);
app.use(cors({ origin: true, credentials: true }));
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Mount Better Auth handler first (needs raw body)
app.all("/api/auth/*splat", toNodeHandler(auth));

// Then JSON parser for other routes
app.use(express.json());

// Routes
app.use("/api/recipes", recipeRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/lists", listRoutes);
app.use("/api/staples", stapleRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/discounts", discountRoutes);

app.get("/api/health", (_req, res) => {
  try {
    db.run(sql`SELECT 1`);
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error", error: "Database unavailable" });
  }
});

// Serve client static files in production
const clientDist = join(__dirname, "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}

export default app;
