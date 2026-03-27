import { createServer } from "node:http";
import app from "./app.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db/connection.js";
import { initSocketIO } from "./websocket/index.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

// Run migrations on startup
migrate(db, { migrationsFolder: "./migrations" });
console.log("Database migrations applied.");

const server = createServer(app);
initSocketIO(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export { server };
