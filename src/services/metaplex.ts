import { Metaplex, keypairIdentity, lamports } from "@metaplex-foundation/js";
import type { Amount, MetaplexFile } from "@metaplex-foundation/js";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { TurboStorageDriver } from "../../../packages/cli/src/upload/TurboStorageDriver.js";
import { config } from "../config.js";
import debugModule from "debug";

const debug = debugModule("service:metaplex");

function createRemotePublisherSigner(
  publisherPubkey: PublicKey
): Keypair {
  return {
    publicKey: publisherPubkey,
    secretKey: new Uint8Array(64),
  } as unknown as Keypair;
}

export function createMetaplexInstance(
  connection: Connection,
  publisherPubkey: PublicKey
) {
  const publisherSigner =
    createRemotePublisherSigner(publisherPubkey);
  const metaplex = Metaplex.make(connection).use(
    keypairIdentity(publisherSigner)
  );

  const turboDriver = new TurboStorageDriver(
    config.serviceKeypair,
    config.isDevnet ? "devnet" : "mainnet",
    config.turboBufferPercentage
  );

  const metaplexAdapter = {
    async upload(file: MetaplexFile): Promise<string> {
      return turboDriver.upload(file);
    },
    async getUploadPrice(bytes: number): Promise<Amount> {
      const price = await turboDriver.getUploadPrice(bytes);
      return lamports(price);
    },
  };

  metaplex.storage().setDriver(metaplexAdapter);

  debug(
    "Created Metaplex instance for publisher %s",
    publisherPubkey.toBase58()
  );

  return { metaplex, publisherSigner };
}
