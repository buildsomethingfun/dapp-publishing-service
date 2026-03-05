import express from "express";
import type { Request } from "express";
import cors from "cors";
import { config } from "./config.js";
import { createAppRouter } from "./routes/createApp.js";
import { createReleaseRouter } from "./routes/createRelease.js";
import { publishRouter } from "./routes/publish.js";
import { buildApkRouter } from "./routes/buildApk.js";
import { uploadAssetRouter } from "./routes/uploadAsset.js";
import { renderScreenshotsRouter } from "./routes/renderScreenshots.js";
import { buildPaymentRouter } from "./routes/buildPayment.js";
import { createPublisherRouter } from "./routes/createPublisher.js";

const app = express();

app.use(cors());

// Raw body capture function for HMAC verification
const rawBodyCapture = (req: Request & { rawBody?: Buffer }, _res: unknown, buf: Buffer) => {
  req.rawBody = buf;
};

// Routes with larger body limits (must be before global parser)
app.use("/api/upload-asset", express.json({ limit: "15mb", verify: rawBodyCapture }), uploadAssetRouter);
app.use("/api/render-screenshots", express.json({ limit: "3mb", verify: rawBodyCapture }), renderScreenshotsRouter);

// Global JSON parser for remaining routes
app.use(
  express.json({
    verify: rawBodyCapture,
  })
);

app.use("/api/create-app", createAppRouter);
app.use("/api/create-release", createReleaseRouter);
app.use("/api/publish", publishRouter);
app.use("/api/build-apk", buildApkRouter);
app.use("/api/build-payment", buildPaymentRouter);
app.use("/api/create-publisher", createPublisherRouter);

// Serve saved screenshots as static files
app.use("/screenshots", express.static("/app/screenshots", {
  maxAge: "365d",
  immutable: true,
}));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`Publishing service listening on port ${config.port}`);
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Service wallet: ${config.serviceKeypair.publicKey.toBase58()}`);
});
