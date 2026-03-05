import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import { z } from "zod";
import { hmacAuth } from "../middleware/hmac-auth.js";
import { renderScreenshots, isRendering } from "../services/screenshot-renderer.js";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import debugModule from "debug";

const debug = debugModule("service:render-screenshots");

const MAX_HTML_SIZE = 500 * 1024; // 500KB per page
const SCREENSHOTS_DIR = "/app/screenshots";

const RenderScreenshotsSchema = z.object({
  htmlPages: z.array(z.string().max(MAX_HTML_SIZE)).min(1).max(4),
});

export const renderScreenshotsRouter: RouterType = Router();

renderScreenshotsRouter.post("/", hmacAuth, async (req: Request, res: Response) => {
  if (isRendering()) {
    res.status(429).json({ error: "Screenshot renderer is busy. Try again later." });
    return;
  }

  try {
    const parsed = RenderScreenshotsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    debug("Rendering %d screenshots", parsed.data.htmlPages.length);

    const pngBuffers = await renderScreenshots(parsed.data.htmlPages);

    // Save to disk and return URLs served by this service
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    const batchId = randomBytes(8).toString("hex");

    const urls = await Promise.all(
      pngBuffers.map(async (buf, i) => {
        const filename = `${batchId}-${i + 1}.png`;
        const filepath = path.join(SCREENSHOTS_DIR, filename);
        await writeFile(filepath, buf);
        debug("Saved screenshot %d/%d: %s (%d bytes)", i + 1, pngBuffers.length, filename, buf.byteLength);

        const baseUrl = process.env.PUBLIC_URL || "https://publish.buildsomething.fun";
        return `${baseUrl}/screenshots/${filename}`;
      })
    );

    debug("All screenshots saved: %o", urls);
    res.json({ screenshots: urls });
  } catch (err: any) {
    if (err.message === "BUSY") {
      res.status(429).json({ error: "Screenshot renderer is busy. Try again later." });
    } else {
      debug("Render failed: %O", err);
      res.status(500).json({ error: err.message ?? "Render failed" });
    }
  }
});
