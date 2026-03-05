import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import { z } from "zod";
import { hmacAuth } from "../middleware/hmac-auth.js";
import { config } from "../config.js";
import { TurboUploader } from "../services/turbo-upload.js";
import { toMetaplexFile } from "@metaplex-foundation/js";
import debugModule from "debug";

const debug = debugModule("service:upload-asset");

const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/html",
];

const MAX_DECODED_BYTES = 10 * 1024 * 1024; // 10MB

const UploadAssetSchema = z.object({
  data: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string().refine(
    (ct) => ALLOWED_CONTENT_TYPES.includes(ct),
    `Must be one of: ${ALLOWED_CONTENT_TYPES.join(", ")}`
  ),
});

export const uploadAssetRouter: RouterType = Router();

uploadAssetRouter.post("/", hmacAuth, async (req: Request, res: Response) => {
  try {
    const parsed = UploadAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    const { data, filename, contentType } = parsed.data;

    // Pre-decode size check: base64 encodes 3 bytes as 4 chars
    const estimatedSize = Math.ceil(data.length * 3 / 4);
    if (estimatedSize > MAX_DECODED_BYTES) {
      res.status(400).json({ error: `File too large (estimated ${estimatedSize} bytes, max ${MAX_DECODED_BYTES})` });
      return;
    }

    const buffer = Buffer.from(data, "base64");
    if (buffer.byteLength > MAX_DECODED_BYTES) {
      res.status(400).json({ error: `File too large (${buffer.byteLength} bytes, max ${MAX_DECODED_BYTES})` });
      return;
    }

    debug("Uploading asset: %s (%s, %d bytes)", filename, contentType, buffer.byteLength);

    const uploader = new TurboUploader(
      config.serviceKeypair,
      config.isDevnet ? "devnet" : "mainnet",
      config.turboBufferPercentage
    );

    const file = toMetaplexFile(buffer, filename, { contentType });
    const url = await uploader.upload(file);

    debug("Asset uploaded: %s → %s", filename, url);
    res.json({ url });
  } catch (err: any) {
    debug("Upload failed: %O", err);
    res.status(500).json({ error: err.message ?? "Upload failed" });
  }
});
