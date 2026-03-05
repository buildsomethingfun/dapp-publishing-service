import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { hmacAuth } from "../middleware/hmac-auth.js";
import { config } from "../config.js";
import debugModule from "debug";

const debug = debugModule("service:build-payment");

export const buildPaymentRouter: RouterType = Router();

/**
 * POST /api/build-payment
 * Creates a partially-signed SOL transfer transaction for the user to sign.
 * Body: { walletAddress: string, feeLamports?: number }
 * Returns: { transaction: string (base64), feeLamports: number }
 */
buildPaymentRouter.post("/", hmacAuth, async (req: Request, res: Response) => {
  try {
    const { walletAddress, feeLamports } = req.body;

    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    let publisherPubkey: PublicKey;
    try {
      publisherPubkey = new PublicKey(walletAddress);
    } catch {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }

    const amount = feeLamports ?? config.uploadFeeLamports;
    const serviceWallet = config.serviceKeypair.publicKey;

    const { blockhash, lastValidBlockHeight } =
      await config.connection.getLatestBlockhash();

    const tx = new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: publisherPubkey,
    });

    tx.add(
      SystemProgram.transfer({
        fromPubkey: publisherPubkey,
        toPubkey: serviceWallet,
        lamports: amount,
      }),
    );

    // No partial signing needed — this is a simple transfer with only the user as signer
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    debug(
      "Built payment tx: %s -> %s, %d lamports",
      publisherPubkey.toBase58(),
      serviceWallet.toBase58(),
      amount,
    );

    res.json({
      transaction: Buffer.from(serialized).toString("base64"),
      feeLamports: amount,
      serviceWallet: serviceWallet.toBase58(),
    });
  } catch (err) {
    debug("Error building payment tx: %O", err);
    res.status(500).json({ error: "Failed to build payment transaction" });
  }
});

/**
 * POST /api/build-payment/verify
 * Verifies that a SOL transfer transaction was confirmed on-chain.
 * Body: { signature: string, walletAddress: string, feeLamports?: number }
 * Returns: { verified: true } or { verified: false, reason: string }
 */
buildPaymentRouter.post("/verify", hmacAuth, async (req: Request, res: Response) => {
  try {
    const { signature, walletAddress, feeLamports } = req.body;

    if (!signature || typeof signature !== "string") {
      res.status(400).json({ error: "signature is required" });
      return;
    }
    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const expectedAmount = feeLamports ?? config.uploadFeeLamports;
    const serviceWallet = config.serviceKeypair.publicKey.toBase58();

    debug("Verifying payment: sig=%s, wallet=%s", signature, walletAddress);

    // Fetch the confirmed transaction
    const txResult = await config.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!txResult) {
      res.json({ verified: false, reason: "Transaction not found or not yet confirmed" });
      return;
    }

    if (txResult.meta?.err) {
      res.json({ verified: false, reason: "Transaction failed on-chain" });
      return;
    }

    // Check that the transaction includes a transfer to the service wallet
    // by comparing pre/post balances of the service wallet
    const accountKeys = txResult.transaction.message.getAccountKeys();
    let serviceWalletIdx = -1;
    let senderIdx = -1;

    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys.get(i)?.toBase58();
      if (key === serviceWallet) serviceWalletIdx = i;
      if (key === walletAddress) senderIdx = i;
    }

    if (serviceWalletIdx === -1) {
      res.json({ verified: false, reason: "Service wallet not in transaction" });
      return;
    }

    if (senderIdx === -1) {
      res.json({ verified: false, reason: "Sender wallet not in transaction" });
      return;
    }

    // Check the balance change on the service wallet
    const preBalance = txResult.meta!.preBalances[serviceWalletIdx];
    const postBalance = txResult.meta!.postBalances[serviceWalletIdx];
    const received = postBalance - preBalance;

    if (received < expectedAmount) {
      debug(
        "Insufficient payment: received %d, expected %d",
        received,
        expectedAmount,
      );
      res.json({
        verified: false,
        reason: `Insufficient payment: received ${received} lamports, expected ${expectedAmount}`,
      });
      return;
    }

    debug("Payment verified: %d lamports received", received);
    res.json({ verified: true });
  } catch (err) {
    debug("Error verifying payment: %O", err);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});
