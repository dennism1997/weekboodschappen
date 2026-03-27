import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db/connection.js";
import { initScheduler } from "./jobs/scheduler.js";
import { initSocketIO } from "./websocket/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "6883", 10);

// Run migrations on startup
migrate(db, { migrationsFolder: path.resolve(__dirname, "../migrations") });
console.log("Database migrations applied.");

const server = createServer(app);
initSocketIO(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initScheduler();
});

export { server };
