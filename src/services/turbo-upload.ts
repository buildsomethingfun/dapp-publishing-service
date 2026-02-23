import { TurboFactory } from "@ardrive/turbo-sdk";
import type { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { MetaplexFile, Amount } from "@metaplex-foundation/js";
import { lamports } from "@metaplex-foundation/js";
import debugModule from "debug";

const debug = debugModule("service:turbo-upload");

export class TurboUploader {
  private secretKeyBase58: string;
  private network: "devnet" | "mainnet";

  constructor(
    keypair: Keypair,
    network: "devnet" | "mainnet",
    _bufferPct: number
  ) {
    this.secretKeyBase58 = bs58.encode(keypair.secretKey);
    this.network = network;
  }

  private makeTurbo() {
    return TurboFactory.authenticated({
      privateKey: this.secretKeyBase58,
      token: "solana",
      gatewayUrl:
        this.network === "devnet"
          ? "https://upload.ardrive.dev"
          : undefined,
    });
  }

  async upload(file: MetaplexFile): Promise<string> {
    const turbo = this.makeTurbo();
    const buffer = Buffer.from(file.buffer);
    debug("Uploading %d bytes to Arweave", buffer.byteLength);

    const result = await turbo.uploadFile({
      fileStreamFactory: () => buffer as unknown as ReadableStream,
      fileSizeFactory: () => buffer.byteLength,
      dataItemOpts: {
        tags: [
          { name: "Content-Type", value: file.contentType || "application/octet-stream" },
        ],
      },
    });

    const uri = `https://arweave.net/${result.id}`;
    debug("Uploaded to %s", uri);
    return uri;
  }

  async getUploadPrice(bytes: number): Promise<Amount> {
    const turbo = this.makeTurbo();
    const [price] = await turbo.getUploadCosts({ bytes: [bytes] });
    return lamports(Number(price.winc));
  }
}
