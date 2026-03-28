import {NextFunction, Request, Response} from "express";
import {fromNodeHeaders} from "better-auth/node";
import {auth} from "../auth.js";
import {db} from "../db/connection.js";
import {organization} from "../db/auth-schema.js";
import {eq} from "drizzle-orm";

export interface AuthPayload {
  userId: string;
  householdId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const activeOrgId = (session.session as any).activeOrganizationId;

    // Check household status if user has an active organization
    if (activeOrgId) {
      const org = db
        .select({ status: organization.status })
        .from(organization)
        .where(eq(organization.id, activeOrgId))
        .get();

      if (org?.status === "waiting") {
        res.status(403).json({ error: "HOUSEHOLD_PENDING" });
        return;
      }

      if (org?.status === "deactivated") {
        res.status(403).json({ error: "HOUSEHOLD_DEACTIVATED" });
        return;
      }
    }

    req.user = {
      userId: session.user.id,
      householdId: activeOrgId || "",
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
