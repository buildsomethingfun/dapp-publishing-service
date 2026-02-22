import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { createAppRouter } from "./routes/createApp.js";
import { createReleaseRouter } from "./routes/createRelease.js";
import { publishRouter } from "./routes/publish.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/create-app", createAppRouter);
app.use("/api/create-release", createReleaseRouter);
app.use("/api/publish", publishRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`Publishing service listening on port ${config.port}`);
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Service wallet: ${config.serviceKeypair.publicKey.toBase58()}`);
});
