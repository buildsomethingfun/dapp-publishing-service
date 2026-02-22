import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import { PublicKey, Keypair } from "@solana/web3.js";
import { createApp } from "@solana-mobile/dapp-store-publishing-tools";
import type { App } from "@solana-mobile/dapp-store-publishing-tools";
import { config } from "../config.js";
import { buildPartiallySignedTransaction } from "../services/transaction.js";
import { CreateAppRequestSchema } from "../types.js";
import { upload } from "../middleware/upload.js";
import {
  readFileAsMetaplexFile,
  cleanupTempFiles,
  buildContext,
} from "../utils.js";
import debugModule from "debug";

const debug = debugModule("service:create-app");

export const createAppRouter: RouterType = Router();

createAppRouter.post(
  "/",
  upload.single("icon"),
  async (req: Request, res: Response) => {
    const tempFiles: string[] = [];

    try {
      if (req.file) {
        tempFiles.push(req.file.path);
      }

      const parsed = CreateAppRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const {
        publisherAddress,
        publisherMintAddress,
        appName,
        androidPackage,
        urls,
      } = parsed.data;

      if (!req.file) {
        res.status(400).json({ error: "Icon file is required" });
        return;
      }

      const publisherPubkey = new PublicKey(publisherAddress);
      const publisherMint = new PublicKey(publisherMintAddress);
      const iconFile = await readFileAsMetaplexFile(
        req.file.path,
        req.file.originalname
      );

      const appDetails: App = {
        name: appName,
        icon: iconFile,
        address: "",
        android_package: androidPackage,
        urls,
        media: [],
      };

      const mintKeypair = Keypair.generate();
      const context = buildContext(publisherPubkey);

      debug("Creating app NFT for %s", appName);

      const txBuilder = await createApp(
        {
          publisherMintAddress: publisherMint,
          mintAddress: mintKeypair,
          appDetails,
          priorityFeeLamports: 12_000,
        },
        context
      );

      const result = await buildPartiallySignedTransaction(
        config.connection,
        txBuilder,
        mintKeypair,
        publisherPubkey,
        config.serviceKeypair.publicKey,
        config.uploadFeeLamports
      );

      debug("App transaction built, mint: %s", result.mintAddress);
      res.json(result);
    } catch (err: any) {
      debug("Error creating app: %O", err);
      res.status(500).json({ error: err.message ?? "Internal server error" });
    } finally {
      await cleanupTempFiles(tempFiles);
    }
  }
);
