import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import type { Amount, MetaplexFile } from "@metaplex-foundation/js";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { TurboUploader } from "./turbo-upload.js";
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

  const uploader = new TurboUploader(
    config.serviceKeypair,
    config.isDevnet ? "devnet" : "mainnet",
    config.turboBufferPercentage
  );

  const metaplexAdapter = {
    async upload(file: MetaplexFile): Promise<string> {
      return uploader.upload(file);
    },
    async getUploadPrice(bytes: number): Promise<Amount> {
      return uploader.getUploadPrice(bytes);
    },
  };

  metaplex.storage().setDriver(metaplexAdapter);

  debug(
    "Created Metaplex instance for publisher %s",
    publisherPubkey.toBase58()
  );

  return { metaplex, publisherSigner };
}
