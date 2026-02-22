# buildsomethingfun-publishing-service

Express.js backend that wraps `@solana-mobile/dapp-store-publishing-tools` and exposes REST endpoints for mobile wallet adapters. It builds partially-signed Solana transactions that a mobile wallet can co-sign and submit on-chain.

## How it works

The service sits between a mobile app and the Solana dApp Store SDK. A mobile wallet cannot run the CLI directly, so this backend handles the compute-heavy parts (metadata upload to Arweave, NFT instruction building) and returns a serialized transaction for the wallet to sign.

### Mock publisher pattern

The SDK's `createApp()` and `createRelease()` expect a `Keypair` for the publisher. The backend creates a fake `Keypair` object that has the mobile user's public key but a zeroed-out secret key. This works because Metaplex's `TransactionBuilder.toTransaction()` only reads `.publicKey` to populate instruction account addresses -- it never calls sign. The backend partially signs with the mint keypair (which it generates server-side), then the mobile wallet adds the publisher's signature before submitting.

### Storage cost fronting

The backend's service keypair pays for Arweave uploads via Turbo. A reimbursement SOL transfer instruction can be prepended to the mint transaction so the user pays atomically when they sign and submit.

### Attestation split

The CLI's `createAttestationPayload()` expects a synchronous `sign` callback, but mobile signing is asynchronous across two HTTP round-trips. The service replicates the attestation logic: `/prepare-attestation` returns the raw payload for `wallet.signMessage()`, and `/submit` accepts the signed result and forwards it to the publisher portal.

## Endpoints

### POST /api/create-app

Multipart form data. Accepts publisher address, publisher mint address, app metadata, and an icon file. Returns a base64-encoded partially-signed transaction and the new app NFT mint address.

### POST /api/create-release

Multipart form data. Accepts publisher address, app mint address, publisher/app/release details, media files (icon, banner, screenshots, optional feature graphic, optional video), and an APK. Returns a base64-encoded partially-signed transaction and the new release NFT mint address.

### POST /api/publish/prepare-attestation

JSON body with `publisherAddress`. Returns a base64-encoded attestation buffer (containing slot, blockhash, and a 32-digit request unique ID) for the mobile wallet to sign via `signMessage()`.

### POST /api/publish/submit

JSON body with the signed attestation, request unique ID, NFT addresses, publisher details, and portal submission fields. Submits to the Solana dApp Store publisher portal.

### GET /health

Returns `{ "status": "ok" }`.

## Mobile client flow

```
1. POST /api/create-app
   <- { transaction, mintAddress }
   -> wallet.signTransaction(deserialize(transaction))
   -> connection.sendRawTransaction(signedTx)

2. POST /api/create-release
   <- { transaction, mintAddress }
   -> wallet.signTransaction(deserialize(transaction))
   -> connection.sendRawTransaction(signedTx)

3. POST /api/publish/prepare-attestation
   <- { attestationBuffer, requestUniqueId }
   -> wallet.signMessage(decode(attestationBuffer))

4. POST /api/publish/submit
   <- { success: true }
```

## Setup

1. Copy `.env.example` to `.env` and fill in values:

```
PORT=3000
RPC_URL=https://api.devnet.solana.com
SERVICE_KEYPAIR_PATH=./service-keypair.json
TURBO_BUFFER_PERCENTAGE=20
```

2. Generate a service keypair (this wallet pays for Arweave uploads):

```
solana-keygen new -o service-keypair.json
```

3. Install dependencies:

```
pnpm install
```

4. Run the dev server:

```
pnpm dev
```

## Project structure

```
src/
  index.ts              Express app, server startup
  config.ts             Environment config (RPC URL, service keypair, port)
  types.ts              Zod schemas for API request validation
  utils.ts              Shared helpers (file I/O, multer extraction, context building)
  services/
    metaplex.ts         Metaplex factory with remote signer identity and Turbo storage
    transaction.ts      Transaction building, partial signing, base64 serialization
  routes/
    createApp.ts        POST /api/create-app
    createRelease.ts    POST /api/create-release
    publish.ts          POST /api/publish/prepare-attestation, POST /api/publish/submit
  middleware/
    upload.ts           Multer config for multipart file handling
```
