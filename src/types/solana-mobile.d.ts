declare module "@solana-mobile/dapp-store-publishing-tools" {
  import type { Keypair, PublicKey } from "@solana/web3.js";
  import type { Metaplex, MetaplexFile, TransactionBuilder } from "@metaplex-foundation/js";

  export type Context = {
    publisher: Keypair;
    metaplex: Metaplex;
  };

  export type Publisher = {
    name: string;
    website: string;
    email: string;
    support_email?: string;
  };

  export type App = {
    name: string;
    icon: MetaplexFile;
    address: string;
    android_package: string;
    urls: {
      license_url: string;
      copyright_url: string;
      privacy_policy_url: string;
      website: string;
    };
    media: Array<{
      purpose: string;
      uri: string;
      mime: string;
      width: number;
      height: number;
      sha256: string;
    }>;
  };

  export type Release = {
    address: string;
    media: Array<{
      purpose: "icon" | "banner" | "featureGraphic" | "screenshot" | "video";
      uri: string;
      mime: string;
      width: number;
      height: number;
      sha256: string;
    }>;
    files: Array<{
      purpose: "install";
      uri: string;
      mime: string;
      size: number;
      sha256: string;
    }>;
    android_details: {
      android_package: string;
      min_sdk: number;
      version_code: number;
      cert_fingerprint: string;
      version: string;
      permissions: string[];
      locales: string[];
    };
    catalog: Record<
      string,
      {
        name: string;
        long_description: string;
        new_in_version: string;
        saga_features?: string;
        short_description: string;
      }
    >;
  };

  export function createApp(
    params: {
      publisherMintAddress: PublicKey;
      mintAddress: Keypair;
      appDetails: App;
      priorityFeeLamports: number;
    },
    context: Context
  ): Promise<TransactionBuilder>;

  export function createRelease(
    params: {
      appMintAddress: PublicKey;
      releaseMintAddress: Keypair;
      releaseDetails: Release;
      publisherDetails: Publisher;
      appDetails: App;
      priorityFeeLamports: number;
    },
    context: Context
  ): Promise<{ txBuilder: TransactionBuilder }>;
}
