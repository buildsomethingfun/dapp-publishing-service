import { z } from "zod";

const base58String = z.string().min(32).max(44);

export const CreateAppRequestSchema = z.object({
  publisherAddress: base58String,
  publisherMintAddress: base58String,
  appName: z.string().min(1),
  androidPackage: z.string().min(1),
  urls: z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.object({
      license_url: z.string().url(),
      copyright_url: z.string().url(),
      privacy_policy_url: z.string().url(),
      website: z.string().url(),
    })
  ),
});

export type CreateAppRequest = z.infer<typeof CreateAppRequestSchema>;

export const CreateReleaseRequestSchema = z.object({
  publisherAddress: base58String,
  appMintAddress: base58String,
  publisherDetails: z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.object({
      name: z.string().min(1),
      website: z.string().url(),
      email: z.string().email(),
      support_email: z.string().email().optional(),
    })
  ),
  appDetails: z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.object({
      name: z.string().min(1),
      android_package: z.string().min(1),
      urls: z.object({
        license_url: z.string().url(),
        copyright_url: z.string().url(),
        privacy_policy_url: z.string().url(),
        website: z.string().url(),
      }),
    })
  ),
  releaseDetails: z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.object({
      catalog: z.record(
        z.object({
          name: z.string(),
          long_description: z.string(),
          new_in_version: z.string(),
          saga_features: z.string().optional(),
          short_description: z.string(),
        })
      ),
      android_details: z.object({
        android_package: z.string(),
        min_sdk: z.number(),
        version_code: z.number(),
        cert_fingerprint: z.string(),
        version: z.string(),
        permissions: z.array(z.string()),
        locales: z.array(z.string()),
      }),
    })
  ),
});

export type CreateReleaseRequest = z.infer<
  typeof CreateReleaseRequestSchema
>;

export const PrepareAttestationRequestSchema = z.object({
  publisherAddress: base58String,
});

export type PrepareAttestationRequest = z.infer<
  typeof PrepareAttestationRequestSchema
>;

export const PublishSubmitRequestSchema = z.object({
  signedAttestation: z.string().min(1),
  requestUniqueId: z.string().length(32),
  appMintAddress: base58String,
  releaseMintAddress: base58String,
  publisherDetails: z.object({
    name: z.string().min(1),
    website: z.string().url(),
    email: z.string().email(),
    support_email: z.string().email().optional(),
  }),
  solanaMobileDappPublisherPortalDetails: z.object({
    google_store_package: z.string().optional(),
    testing_instructions: z.string().optional(),
    alpha_testers: z
      .array(
        z.object({ address: z.string(), comment: z.string() })
      )
      .optional(),
  }),
  compliesWithSolanaDappStorePolicies: z.boolean(),
  requestorIsAuthorized: z.boolean(),
  alphaTest: z.boolean().optional(),
});

export type PublishSubmitRequest = z.infer<
  typeof PublishSubmitRequestSchema
>;

export interface TransactionResponse {
  transaction: string;
  mintAddress: string;
}

export interface PrepareAttestationResponse {
  attestationBuffer: string;
  requestUniqueId: string;
}
