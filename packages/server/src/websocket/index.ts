import {Server as HttpServer} from "node:http";
import {Server, Socket} from "socket.io";
import {auth} from "../auth.js";
import {db} from "../db/connection.js";
import {groceryItem} from "../db/schema.js";
import {and, eq} from "drizzle-orm";
import {randomUUID} from "node:crypto";

export let io: Server;

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    householdId: string;
  };
}

export function initSocketIO(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: (process.env.TRUSTED_ORIGINS || "http://localhost:5173").split(","),
      credentials: true,
    },
  });

  // Auth middleware: verify session via cookies forwarded in handshake
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || "";
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookieHeader }),
      });

      if (!session?.session) {
        return next(new Error("Authentication required"));
      }

      const activeOrgId = (session.session as any).activeOrganizationId;
      if (!activeOrgId) {
        return next(new Error("No active household"));
      }

      socket.data.userId = session.user.id;
      socket.data.householdId = activeOrgId;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { userId, householdId } = socket.data;
    const room = `household:${householdId}`;

    socket.join(room);
    console.log(`Socket ${socket.id} joined ${room} (user ${userId})`);

    socket.on("disconnect", () => {
      console.log(`Socket ${socket.id} left ${room}`);
    });

    // Handle item:check
    socket.on(
      "item:check",
      async (data: { listId: string; itemId: string; checked: boolean }) => {
        try {
          const newStatus = data.checked ? "checked" : "pending";
          await db
            .update(groceryItem)
            .set({
              status: newStatus,
              checkedBy: data.checked ? userId : null,
              checkedAt: data.checked ? new Date().toISOString() : null,
            })
            .where(
              and(
                eq(groceryItem.id, data.itemId),
                eq(groceryItem.groceryListId, data.listId),
              ),
            );

          socket.to(room).emit("item:updated", {
            listId: data.listId,
            itemId: data.itemId,
            checked: data.checked,
          });
        } catch (err) {
          console.error("item:check error:", err);
        }
      },
    );

    // Handle item:add
    socket.on(
      "item:add",
      async (data: {
        listId: string;
        name: string;
        quantity?: number;
        unit?: string;
      }) => {
        try {
          const newId = randomUUID();
          const newItem = {
            id: newId,
            groceryListId: data.listId,
            name: data.name,
            quantity: data.quantity ?? 1,
            unit: data.unit ?? "stuk",
            category: "Overig",
            source: "manual" as const,
            status: "pending" as const,
            sortOrder: 0,
          };

          await db.insert(groceryItem).values(newItem);

          socket.to(room).emit("item:added", {
            listId: data.listId,
            item: {
              id: newId,
              name: data.name,
              quantity: newItem.quantity,
              unit: newItem.unit,
              category: newItem.category,
              source: "handmatig",
              checked: false,
            },
          });
        } catch (err) {
          console.error("item:add error:", err);
        }
      },
    );
  });

  return io;
}
