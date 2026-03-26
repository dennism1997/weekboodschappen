import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function createToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
