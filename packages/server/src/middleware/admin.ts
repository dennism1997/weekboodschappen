import {NextFunction, Request, Response} from "express";
import {fromNodeHeaders} from "better-auth/node";
import {auth} from "../auth.js";
import {db} from "../db/connection.js";
import {user} from "../db/auth-schema.js";
import {sql} from "drizzle-orm";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // The admin is the first user ever created
    const firstUser = db
      .select({ id: user.id })
      .from(user)
      .orderBy(sql`${user.createdAt} ASC`)
      .limit(1)
      .get();

    if (!firstUser || firstUser.id !== session.user.id) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    req.user = {
      userId: session.user.id,
      householdId: (session.session as any).activeOrganizationId || "",
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
