import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config.js";
import debugModule from "debug";

const debug = debugModule("service:hmac-auth");

/**
 * Express middleware that validates HMAC-SHA256 signatures on requests.
 *
 * Expected headers:
 *   X-Build-Signature: HMAC-SHA256 of `${timestamp}.${method}.${path}.${rawBody}`
 *   X-Build-Timestamp: Unix seconds when the request was signed
 *
 * Rejects requests older than 60 seconds.
 */
export function hmacAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = config.buildSecret;
  if (!secret) {
    debug("BUILD_SECRET not configured — skipping HMAC auth");
    next();
    return;
  }

  const signature = req.headers["x-build-signature"] as string | undefined;
  const timestamp = req.headers["x-build-timestamp"] as string | undefined;

  if (!signature || !timestamp) {
    res.status(401).json({ error: "Missing HMAC signature or timestamp" });
    return;
  }

  // Reject stale requests (>60s)
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(now - ts) > 60) {
    debug("Stale or invalid timestamp: %s (now: %d)", timestamp, now);
    res.status(401).json({ error: "Request timestamp expired or invalid" });
    return;
  }

  // rawBody is attached by express.json({ verify: ... }) — see index.ts
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const bodyStr = rawBody ? rawBody.toString("utf-8") : "";

  // Use originalUrl to get the full path (req.path is relative to the sub-router)
  const message = `${timestamp}.${req.method}.${req.originalUrl}.${bodyStr}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    debug("HMAC mismatch");
    res.status(401).json({ error: "Invalid HMAC signature" });
    return;
  }

  debug("HMAC verified for %s %s", req.method, req.originalUrl);
  next();
}
