import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

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

    // Get active organization (household)
    const activeOrgId = session.session.activeOrganizationId;

    req.user = {
      userId: session.user.id,
      householdId: activeOrgId || "",
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
