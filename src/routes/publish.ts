import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import {
  submitRequestToSolanaDappPublisherPortal,
  CONTACT_OBJECT_ID,
  CONTACT_PROPERTY_COMPANY,
  CONTACT_PROPERTY_EMAIL,
  CONTACT_PROPERTY_WEBSITE,
  TICKET_OBJECT_ID,
  TICKET_PROPERTY_ATTESTATION_PAYLOAD,
  TICKET_PROPERTY_AUTHORIZED_REQUEST,
  TICKET_PROPERTY_DAPP_COLLECTION_ACCOUNT_ADDRESS,
  TICKET_PROPERTY_DAPP_RELEASE_ACCOUNT_ADDRESS,
  TICKET_PROPERTY_GOOGLE_PLAY_STORE_PACKAGE_NAME,
  TICKET_PROPERTY_POLICY_COMPLIANT,
  TICKET_PROPERTY_REQUEST_UNIQUE_ID,
  TICKET_PROPERTY_TESTING_INSTRUCTIONS,
  TICKET_PROPERTY_ALPHA_TEST,
  TICKET_PROPERTY_ALPHA_TESTERS,
  URL_FORM_SUBMIT,
} from "../services/dapp-publisher-portal.js";
import { config } from "../config.js";
import {
  PrepareAttestationRequestSchema,
  PublishSubmitRequestSchema,
} from "../types.js";
import { generateRequestUniqueId } from "../utils.js";
import debugModule from "debug";

const debug = debugModule("service:publish");

export const publishRouter: RouterType = Router();

publishRouter.post(
  "/prepare-attestation",
  async (req: Request, res: Response) => {
    try {
      const parsed = PrepareAttestationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const requestUniqueId = generateRequestUniqueId();
      const blockhash =
        await config.connection.getLatestBlockhashAndContext("finalized");

      const attestation = {
        slot_number: blockhash.context.slot,
        blockhash: blockhash.value.blockhash,
        request_unique_id: requestUniqueId,
      };

      const attestationBuffer = Buffer.from(
        JSON.stringify(attestation)
      ).toString("base64");

      debug(
        "Prepared attestation for publisher %s, requestId: %s",
        parsed.data.publisherAddress,
        requestUniqueId
      );

      res.json({ attestationBuffer, requestUniqueId });
    } catch (err: any) {
      debug("Error preparing attestation: %O", err);
      res
        .status(500)
        .json({ error: err.message ?? "Internal server error" });
    }
  }
);

publishRouter.post("/submit", async (req: Request, res: Response) => {
  try {
    const parsed = PublishSubmitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }

    const {
      signedAttestation,
      requestUniqueId,
      appMintAddress,
      releaseMintAddress,
      publisherDetails,
      solanaMobileDappPublisherPortalDetails,
      compliesWithSolanaDappStorePolicies,
      requestorIsAuthorized,
      alphaTest,
    } = parsed.data;

    const request: {
      fields: Array<{
        objectTypeId: string;
        name: string;
        value: any;
      }>;
    } = {
      fields: [
        {
          objectTypeId: CONTACT_OBJECT_ID,
          name: CONTACT_PROPERTY_COMPANY,
          value: publisherDetails.name,
        },
        {
          objectTypeId: CONTACT_OBJECT_ID,
          name: CONTACT_PROPERTY_EMAIL,
          value: publisherDetails.email,
        },
        {
          objectTypeId: CONTACT_OBJECT_ID,
          name: CONTACT_PROPERTY_WEBSITE,
          value: publisherDetails.website,
        },
        {
          objectTypeId: TICKET_OBJECT_ID,
          name: TICKET_PROPERTY_ATTESTATION_PAYLOAD,
          value: signedAttestation,
        },
        {
          objectTypeId: TICKET_OBJECT_ID,
          name: TICKET_PROPERTY_DAPP_COLLECTION_ACCOUNT_ADDRESS,
          value: appMintAddress,
        },
        {
          objectTypeId: TICKET_OBJECT_ID,
          name: TICKET_PROPERTY_DAPP_RELEASE_ACCOUNT_ADDRESS,
          value: releaseMintAddress,
        },
        {
          objectTypeId: TICKET_OBJECT_ID,
          name: TICKET_PROPERTY_REQUEST_UNIQUE_ID,
          value: requestUniqueId,
        },
        {
          objectTypeId: TICKET_OBJECT_ID,
          name: TICKET_PROPERTY_AUTHORIZED_REQUEST,
          value: requestorIsAuthorized,
        },
        {
          objectTypeId: TICKET_OBJECT_ID,
          name: TICKET_PROPERTY_POLICY_COMPLIANT,
          value: compliesWithSolanaDappStorePolicies,
        },
      ],
    };

    if (solanaMobileDappPublisherPortalDetails.google_store_package) {
      request.fields.push({
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_GOOGLE_PLAY_STORE_PACKAGE_NAME,
        value:
          solanaMobileDappPublisherPortalDetails.google_store_package,
      });
    }

    if (alphaTest) {
      request.fields.push({
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_ALPHA_TEST,
        value: true,
      });
    }

    if (solanaMobileDappPublisherPortalDetails.testing_instructions) {
      request.fields.push({
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_TESTING_INSTRUCTIONS,
        value:
          solanaMobileDappPublisherPortalDetails.testing_instructions,
      });
    }

    if (
      solanaMobileDappPublisherPortalDetails.alpha_testers &&
      solanaMobileDappPublisherPortalDetails.alpha_testers.length > 0
    ) {
      request.fields.push({
        objectTypeId: TICKET_OBJECT_ID,
        name: TICKET_PROPERTY_ALPHA_TESTERS,
        value: solanaMobileDappPublisherPortalDetails.alpha_testers
          .map((tester) => tester.address)
          .toString(),
      });
    }

    debug(
      "Submitting to dApp publisher portal for app %s",
      appMintAddress
    );

    await submitRequestToSolanaDappPublisherPortal(
      request,
      URL_FORM_SUBMIT,
      false
    );

    res.json({ success: true });
  } catch (err: any) {
    debug("Error submitting to portal: %O", err);
    res
      .status(500)
      .json({ error: err.message ?? "Internal server error" });
  }
});
