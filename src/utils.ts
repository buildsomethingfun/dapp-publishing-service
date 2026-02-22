import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PublicKey } from "@solana/web3.js";
import { toMetaplexFile } from "@metaplex-foundation/js";
import type { MetaplexFile } from "@metaplex-foundation/js";
import type { Context } from "@solana-mobile/dapp-store-publishing-tools";
import { createMetaplexInstance } from "./services/metaplex.js";
import { config } from "./config.js";

export function generateRequestUniqueId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function readFileAsMetaplexFile(
  filePath: string,
  originalName: string
): Promise<MetaplexFile> {
  const buffer = await fs.promises.readFile(filePath);
  return toMetaplexFile(buffer, originalName);
}

export function toRelativePath(absPath: string): string {
  return path.relative(process.cwd(), absPath);
}

export async function cleanupTempFiles(
  paths: string[]
): Promise<void> {
  for (const filePath of paths) {
    await fs.promises.unlink(filePath).catch(() => {});
  }
}

export function getUploadedFile(
  files:
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined,
  field: string
): Express.Multer.File | undefined {
  if (!files) return undefined;
  return files[field]?.[0];
}

export function getUploadedFiles(
  files:
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined,
  field: string
): Express.Multer.File[] {
  if (!files) return [];
  return files[field] ?? [];
}

export function buildContext(publisherPubkey: PublicKey): Context {
  const { metaplex, publisherSigner } = createMetaplexInstance(
    config.connection,
    publisherPubkey
  );
  return { publisher: publisherSigner, metaplex };
}
