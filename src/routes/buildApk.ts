import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import { z } from "zod";
import { hmacAuth } from "../middleware/hmac-auth.js";
import { queueBuild, getBuildStatus } from "../services/apk-builder.js";
import debugModule from "debug";

const debug = debugModule("service:build-apk");

const BuildApkRequestSchema = z.object({
  deployedUrl: z.string().url().refine(
    (url) => /^https:\/\/.*\.workers\.dev/.test(url),
    "Must be a *.workers.dev HTTPS URL"
  ),
  appName: z.string().min(1).max(100),
  packageName: z.string().regex(
    /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/,
    "Must be a valid Android applicationId (e.g. fun.buildsomething.myapp)"
  ),
  iconUrl: z.string().url().startsWith("https://").optional().or(z.literal("")),
  version: z.string().regex(
    /^\d+\.\d+\.\d+$/,
    "Must be semver (e.g. 1.0.0)"
  ),
  versionCode: z.number().int().positive().max(2_100_000_000),
});

export const buildApkRouter: RouterType = Router();

// POST / — Trigger APK build
buildApkRouter.post("/", hmacAuth, async (req: Request, res: Response) => {
  try {
    const parsed = BuildApkRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    debug("Build requested for %s (%s)", parsed.data.appName, parsed.data.packageName);

    const buildId = queueBuild(parsed.data);
    res.json({ buildId });
  } catch (err: any) {
    if (err.message?.includes("Too many concurrent")) {
      res.status(429).json({ error: err.message });
    } else {
      debug("Error triggering build: %O", err);
      res.status(500).json({ error: err.message ?? "Internal server error" });
    }
  }
});

// GET /:buildId/status — Check build status
buildApkRouter.get("/:buildId/status", hmacAuth, async (req: Request, res: Response) => {
  const { buildId } = req.params;
  const status = getBuildStatus(buildId);

  if (!status) {
    res.status(404).json({ error: "Build not found" });
    return;
  }

  res.json(status);
});
