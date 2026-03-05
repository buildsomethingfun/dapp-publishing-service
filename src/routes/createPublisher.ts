import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import { PublicKey, Keypair, ComputeBudgetProgram } from "@solana/web3.js";
import type { MetaplexFile, TransactionBuilder } from "@metaplex-foundation/js";
import { config } from "../config.js";
import { buildPartiallySignedTransaction } from "../services/transaction.js";
import { CreatePublisherRequestSchema } from "../types.js";
import { upload } from "../middleware/upload.js";
import {
  readFileAsMetaplexFile,
  cleanupTempFiles,
  buildContext,
} from "../utils.js";
import debugModule from "debug";

const debug = debugModule("service:create-publisher");

const SCHEMA_VERSION = "0.4.0";

/**
 * Build publisher NFT metadata matching the Solana dApp Store schema.
 * Reimplemented from the SDK's PublisherCore (removed in solana-mobile/dapp-publishing bc5bd76).
 */
function createPublisherJson(publisher: {
  address: string;
  name: string;
  icon: MetaplexFile;
  website: string;
  email: string;
}) {
  return {
    schema_version: SCHEMA_VERSION,
    name: publisher.name,
    image: publisher.icon as string | MetaplexFile,
    external_url: publisher.website,
    properties: {
      category: "dApp",
      creators: [
        {
          address: publisher.address,
          share: 100,
        },
      ],
    },
    extensions: {
      solana_dapp_store: {
        publisher_details: {
          name: publisher.name,
          website: publisher.website,
          contact: publisher.email,
        },
      },
    },
  };
}

/**
 * Mint a publisher NFT (collection NFT).
 * Reimplements mintNft from SDK CoreUtils — uploads metadata to Arweave,
 * builds the NFT create transaction with compute budget instructions.
 */
async function mintPublisherNft(
  metaplex: ReturnType<typeof buildContext>["metaplex"],
  json: ReturnType<typeof createPublisherJson>,
  mintKeypair: Keypair,
  priorityFeeLamports: number
): Promise<TransactionBuilder> {
  const { uri } = await metaplex.nfts().uploadMetadata(json);
  const computeBudget = 250_000;

  const txBuilder = await metaplex
    .nfts()
    .builders()
    .create({
      isCollection: true,
      isMutable: true,
      useNewMint: mintKeypair,
      uri,
      name: json.name,
      sellerFeeBasisPoints: 0,
    });

  txBuilder.prepend({
    instruction: ComputeBudgetProgram.setComputeUnitLimit({
      units: computeBudget,
    }),
    signers: [],
  });

  const microLamportsPerCU = (1_000_000 * priorityFeeLamports) / computeBudget;
  txBuilder.prepend({
    instruction: ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: microLamportsPerCU,
    }),
    signers: [],
  });

  return txBuilder;
}

export const createPublisherRouter: RouterType = Router();

createPublisherRouter.post(
  "/",
  upload.single("icon"),
  async (req: Request, res: Response) => {
    const tempFiles: string[] = [];

    try {
      if (req.file) {
        tempFiles.push(req.file.path);
      }

      const parsed = CreatePublisherRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const { publisherAddress, publisherName, publisherWebsite, publisherEmail } =
        parsed.data;

      if (!req.file) {
        res.status(400).json({ error: "Icon file is required" });
        return;
      }

      const publisherPubkey = new PublicKey(publisherAddress);
      const iconFile = await readFileAsMetaplexFile(
        req.file.path,
        req.file.originalname
      );

      const publisherJson = createPublisherJson({
        address: publisherAddress,
        name: publisherName,
        icon: iconFile,
        website: publisherWebsite,
        email: publisherEmail,
      });

      const mintKeypair = Keypair.generate();
      const context = buildContext(publisherPubkey);

      debug("Creating publisher NFT for %s (%s)", publisherName, publisherAddress);

      const txBuilder = await mintPublisherNft(
        context.metaplex,
        publisherJson,
        mintKeypair,
        12_000
      );

      const result = await buildPartiallySignedTransaction(
        config.connection,
        txBuilder,
        mintKeypair,
        publisherPubkey,
        config.serviceKeypair.publicKey,
        config.uploadFeeLamports
      );

      debug("Publisher transaction built, mint: %s", result.mintAddress);
      res.json(result);
    } catch (err: any) {
      debug("Error creating publisher: %O", err);
      res.status(500).json({ error: err.message ?? "Internal server error" });
    } finally {
      await cleanupTempFiles(tempFiles);
    }
  }
);
