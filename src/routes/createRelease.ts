import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import { PublicKey, Keypair } from "@solana/web3.js";
import { createRelease } from "@solana-mobile/dapp-store-publishing-tools";
import type {
  App,
  Release,
  Publisher,
} from "@solana-mobile/dapp-store-publishing-tools";
import { config } from "../config.js";
import { buildPartiallySignedTransaction } from "../services/transaction.js";
import { CreateReleaseRequestSchema } from "../types.js";
import { upload } from "../middleware/upload.js";
import {
  readFileAsMetaplexFile,
  toRelativePath,
  cleanupTempFiles,
  getUploadedFile,
  getUploadedFiles,
  buildContext,
} from "../utils.js";
import debugModule from "debug";

const debug = debugModule("service:create-release");

export const createReleaseRouter: RouterType = Router();

const releaseUpload = upload.fields([
  { name: "icon", maxCount: 1 },
  { name: "banner", maxCount: 1 },
  { name: "featureGraphic", maxCount: 1 },
  { name: "screenshots", maxCount: 10 },
  { name: "video", maxCount: 1 },
  { name: "install", maxCount: 1 },
]);

createReleaseRouter.post(
  "/",
  releaseUpload,
  async (req: Request, res: Response) => {
    const tempFiles: string[] = [];

    try {
      const parsed = CreateReleaseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const {
        publisherAddress,
        appMintAddress,
        publisherDetails,
        appDetails,
        releaseDetails,
      } = parsed.data;

      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;

      const iconFile = getUploadedFile(files, "icon");
      const bannerFile = getUploadedFile(files, "banner");
      const featureGraphicFile = getUploadedFile(files, "featureGraphic");
      const screenshotFiles = getUploadedFiles(files, "screenshots");
      const videoFile = getUploadedFile(files, "video");
      const installFile = getUploadedFile(files, "install");

      if (!iconFile) {
        res.status(400).json({ error: "Icon file is required" });
        return;
      }
      if (!bannerFile) {
        res.status(400).json({ error: "Banner file is required" });
        return;
      }
      if (screenshotFiles.length < 4) {
        res
          .status(400)
          .json({ error: "At least 4 screenshots are required" });
        return;
      }
      if (!installFile) {
        res.status(400).json({ error: "Install (APK) file is required" });
        return;
      }

      [
        iconFile,
        bannerFile,
        featureGraphicFile,
        ...screenshotFiles,
        videoFile,
        installFile,
      ]
        .filter((f): f is Express.Multer.File => f != null)
        .forEach((f) => tempFiles.push(f.path));

      const publisherPubkey = new PublicKey(publisherAddress);
      const appMint = new PublicKey(appMintAddress);
      const iconMetaplexFile = await readFileAsMetaplexFile(
        iconFile.path,
        iconFile.originalname
      );

      const media: Release["media"] = [];

      media.push({
        purpose: "icon" as const,
        uri: toRelativePath(iconFile.path),
        mime: "",
        width: 0,
        height: 0,
        sha256: "",
      });

      media.push({
        purpose: "banner" as const,
        uri: toRelativePath(bannerFile.path),
        mime: "",
        width: 0,
        height: 0,
        sha256: "",
      });

      if (featureGraphicFile) {
        media.push({
          purpose: "featureGraphic" as const,
          uri: toRelativePath(featureGraphicFile.path),
          mime: "",
          width: 0,
          height: 0,
          sha256: "",
        });
      }

      for (const screenshot of screenshotFiles) {
        media.push({
          purpose: "screenshot" as const,
          uri: toRelativePath(screenshot.path),
          mime: "",
          width: 0,
          height: 0,
          sha256: "",
        });
      }

      if (videoFile) {
        media.push({
          purpose: "video" as const,
          uri: toRelativePath(videoFile.path),
          mime: "",
          width: 0,
          height: 0,
          sha256: "",
        });
      }

      const releaseFiles: Release["files"] = [
        {
          purpose: "install" as const,
          uri: toRelativePath(installFile.path),
          mime: "",
          size: 0,
          sha256: "",
        },
      ];

      const release: Release = {
        address: "",
        media,
        files: releaseFiles,
        android_details: releaseDetails.android_details,
        catalog: releaseDetails.catalog as Release["catalog"],
      };

      const app: App = {
        name: appDetails.name,
        icon: iconMetaplexFile,
        address: appMintAddress,
        android_package: appDetails.android_package,
        urls: appDetails.urls,
        media: [],
      };

      const publisher: Publisher = {
        name: publisherDetails.name,
        website: publisherDetails.website,
        email: publisherDetails.email,
        support_email: publisherDetails.support_email,
      };

      const mintKeypair = Keypair.generate();
      const context = buildContext(publisherPubkey);

      debug("Creating release NFT for %s", appDetails.name);

      const { txBuilder } = await createRelease(
        {
          appMintAddress: appMint,
          releaseMintAddress: mintKeypair,
          releaseDetails: release,
          publisherDetails: publisher,
          appDetails: app,
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

      debug("Release transaction built, mint: %s", result.mintAddress);
      res.json(result);
    } catch (err: any) {
      debug("Error creating release: %O", err);
      res
        .status(500)
        .json({ error: err.message ?? "Internal server error" });
    } finally {
      await cleanupTempFiles(tempFiles);
    }
  }
);
