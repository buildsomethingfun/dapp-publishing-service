/**
 * Extracted from @solana-mobile/dapp-store-publishing-tools
 * packages/core/src/publish/dapp_publisher_portal.ts
 *
 * HubSpot form submission for the Solana dApp Publisher Portal.
 */

import debugModule from "debug";

const debug = debugModule("service:portal");

// HubSpot object/property IDs for the dApp Publisher Portal form
export const CONTACT_OBJECT_ID = "0-1";
export const CONTACT_PROPERTY_COMPANY = "company";
export const CONTACT_PROPERTY_EMAIL = "email";
export const CONTACT_PROPERTY_WEBSITE = "website";

export const TICKET_OBJECT_ID = "0-5";
export const TICKET_PROPERTY_ATTESTATION_PAYLOAD = "attestation_payload";
export const TICKET_PROPERTY_AUTHORIZED_REQUEST = "authorized_request";
export const TICKET_PROPERTY_DAPP_COLLECTION_ACCOUNT_ADDRESS = "dapp_collection_account_address";
export const TICKET_PROPERTY_DAPP_RELEASE_ACCOUNT_ADDRESS = "dapp_release_account_address";
export const TICKET_PROPERTY_GOOGLE_PLAY_STORE_PACKAGE_NAME = "google_play_store_package_name";
export const TICKET_PROPERTY_POLICY_COMPLIANT = "policy_compliant";
export const TICKET_PROPERTY_REQUEST_UNIQUE_ID = "request_unique_id";
export const TICKET_PROPERTY_TESTING_INSTRUCTIONS = "testing_instructions";
export const TICKET_PROPERTY_ALPHA_TEST = "alpha_test";
export const TICKET_PROPERTY_ALPHA_TESTERS = "alpha_testers";

export const URL_FORM_SUBMIT =
  "https://api.hsforms.com/submissions/v3/integration/submit/44702592/f502984d-6f86-4f1e-bd52-f97ba54e9e2b";

type FormField = {
  objectTypeId: string;
  name: string;
  value: unknown;
};

type FormRequest = {
  fields: FormField[];
};

export async function submitRequestToSolanaDappPublisherPortal(
  request: FormRequest,
  url: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    debug("Dry run — would submit to %s: %O", url, request);
    return;
  }

  debug("Submitting to dApp Publisher Portal: %s", url);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Portal submission failed: ${response.status} ${response.statusText} — ${text}`
    );
  }

  debug("Portal submission succeeded");
}
