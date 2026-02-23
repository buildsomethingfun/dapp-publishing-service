import "dotenv/config";
import { Keypair, Connection } from "@solana/web3.js";
import fs from "fs";
import path from "path";

function loadKeypair(keypairPath: string): Keypair {
  const resolved = path.resolve(keypairPath);
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

const SERVICE_KEYPAIR_PATH =
  process.env.SERVICE_KEYPAIR_PATH ?? "./service-keypair.json";
const RPC_URL =
  process.env.RPC_URL ?? "https://api.devnet.solana.com";
const PORT = Number(process.env.PORT ?? 3000);
const TURBO_BUFFER_PERCENTAGE = Number(
  process.env.TURBO_BUFFER_PERCENTAGE ?? 20
);
const UPLOAD_FEE_LAMPORTS = Number(
  process.env.UPLOAD_FEE_LAMPORTS ?? 200_000_000
);
const ANDROID_TEMPLATE_PATH =
  process.env.ANDROID_TEMPLATE_PATH ?? "./webview-template";
const BUILD_SECRET = process.env.BUILD_SECRET ?? "";

export const config = {
  port: PORT,
  rpcUrl: RPC_URL,
  turboBufferPercentage: TURBO_BUFFER_PERCENTAGE,
  serviceKeypair: loadKeypair(SERVICE_KEYPAIR_PATH),
  connection: new Connection(RPC_URL, "confirmed"),
  uploadFeeLamports: UPLOAD_FEE_LAMPORTS,
  androidTemplatePath: path.resolve(ANDROID_TEMPLATE_PATH),
  buildSecret: BUILD_SECRET,
  get isDevnet() {
    return RPC_URL.includes("devnet");
  },
};
