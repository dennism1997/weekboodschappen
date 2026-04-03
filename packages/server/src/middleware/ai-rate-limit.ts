import type {Request, Response, NextFunction} from "express";
import rateLimit from "express-rate-limit";
import type {AuthPayload} from "./auth.js";
import {requireUser} from "./auth.js";

// Per-user rate limiter for AI-powered endpoints (Claude API calls are expensive)
const rateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request & { user?: AuthPayload }) => req.user!.userId,
  message: { error: "Too many AI requests, please try again later" },
});

// Rejects unauthenticated requests, then applies rate limiting by userId
export function aiRateLimiter(req: Request, res: Response, next: NextFunction) {
  requireUser(req, res, () => rateLimiter(req, res, next));
}
