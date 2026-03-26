import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { db } from "./db/connection.js";
import { household } from "./db/schema.js";
import { sql } from "drizzle-orm";
import authRoutes from "./routes/auth.js";
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
app.use(express.json());
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/lists", listRoutes);
app.use("/api/staples", stapleRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/discounts", discountRoutes);

app.get("/api/health", (_req, res) => {
  try {
    db.select({ count: sql<number>`1` })
      .from(household)
      .limit(1)
      .all();
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
