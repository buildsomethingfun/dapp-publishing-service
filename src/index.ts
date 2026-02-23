import express from "express";
import type { Request } from "express";
import cors from "cors";
import { config } from "./config.js";
import { createAppRouter } from "./routes/createApp.js";
import { createReleaseRouter } from "./routes/createRelease.js";
import { publishRouter } from "./routes/publish.js";
import { buildApkRouter } from "./routes/buildApk.js";

const app = express();

app.use(cors());

// Capture raw body for HMAC signature verification
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use("/api/create-app", createAppRouter);
app.use("/api/create-release", createReleaseRouter);
app.use("/api/publish", publishRouter);
app.use("/api/build-apk", buildApkRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`Publishing service listening on port ${config.port}`);
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Service wallet: ${config.serviceKeypair.publicKey.toBase58()}`);
});
