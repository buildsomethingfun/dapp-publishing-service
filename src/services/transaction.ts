import type { TransactionBuilder } from "@metaplex-foundation/js";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import debugModule from "debug";

const debug = debugModule("service:transaction");

export async function buildPartiallySignedTransaction(
  connection: Connection,
  txBuilder: TransactionBuilder,
  mintKeypair: Keypair,
  publisherPubkey: PublicKey,
  serviceWalletPubkey: PublicKey,
  reimbursementLamports: number
): Promise<{ transaction: string; mintAddress: string }> {
  if (reimbursementLamports > 0) {
    txBuilder.prepend({
      instruction: SystemProgram.transfer({
        fromPubkey: publisherPubkey,
        toPubkey: serviceWalletPubkey,
        lamports: reimbursementLamports,
      }),
      signers: [],
    });
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const tx = txBuilder.toTransaction({
    blockhash,
    lastValidBlockHeight,
  });
  tx.feePayer = publisherPubkey;
  tx.partialSign(mintKeypair);

  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const mintAddress = mintKeypair.publicKey.toBase58();
  debug("Built partially signed tx, mint: %s", mintAddress);

  return {
    transaction: Buffer.from(serialized).toString("base64"),
    mintAddress,
  };
}
