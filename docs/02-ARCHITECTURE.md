# HarnGun (หารกัน) - Technical Architecture Document

## 1. Architectural Philosophy
HarnGun is structured as a **Three-Tier, Cloud-Native, Serverless AWS Web Application**.
* **Cost Efficiency:** Idle cost is near $0 (pay-per-request / AWS Free Tier).
* **Mobile-First UX:** Ultra-fast page loads on mobile networks, direct image uploads to S3.
* **Resilience & Scalability:** Serverless compute with AWS Lambda and Amazon DynamoDB.
* **Local Container Parity:** The same core handlers run in Docker Compose (Phase 1 / OS course) and on AWS Lambda (Phase 2). Infrastructure differences are isolated behind adapters (§3) and selected by environment variables.

---

## 2. Three-Tier System Topology (Phase 2 — AWS)

```
+-------------------------------------------------------------+
|             TIER 1: PRESENTATION (FRONTEND)                 |
|  - Mobile-First Web App: React + Vite (TypeScript)          |
|  - Vanilla CSS design tokens, thermal-receipt theme (06)    |
|  - Hosted on AWS S3 Static Website Hosting + CloudFront CDN |
|  - Direct S3 Presigned Upload for Receipt Images            |
+------------------------------+------------------------------+
                               | HTTPS / JSON
+------------------------------v------------------------------+
|            TIER 2: APPLICATION & LOGIC (BACKEND)            |
|  - Amazon API Gateway (HTTP API + JWT authorizer)           |
|  - AWS Lambda Functions: Node.js 22 LTS (TypeScript)        |
|  - Shared Domain Core (Types, Math Engine, EMVCo generator) |
|  - Amazon Bedrock (current Claude Haiku-class vision model) |
|  - AWS Cognito (User Pool for Host Auth)                    |
+------------------------------+------------------------------+
                               | SDK / IAM
+------------------------------v------------------------------+
|                   TIER 3: DATA STORAGE                      |
|  - Amazon DynamoDB (Single-Table / Pay-Per-Request)         |
|  - Amazon S3 (Raw Receipt Images with Lifecycle Expiry)     |
+-------------------------------------------------------------+
```

The Phase 1 Docker topology is described in `08-OS_COURSE_REQUIREMENTS.md`.

---

## 3. Ports & Adapters (Dual Runtime)

All business logic lives in `server/core/` as plain functions that receive typed input plus their dependencies (ports), and return typed output. They never import an AWS SDK client, Express, or Lambda types directly. Two thin entry layers wrap them:

* `server/express/` — Express app used in the Docker `backend` container (Phase 1).
* `server/lambda/` — Lambda handlers behind API Gateway (Phase 2).

| Port (interface) | Phase 1 (Docker) | Phase 2 (AWS) | Selected by |
|---|---|---|---|
| `BillRepository` | DynamoDB adapter → `dynamodb-local` container | DynamoDB adapter → Amazon DynamoDB | `DATABASE_ENDPOINT` (unset = AWS) |
| `ImageStorage` | S3 adapter → MinIO container | S3 adapter → Amazon S3 | `S3_ENDPOINT` (unset = AWS) |
| `ReceiptParser` | `MockParser` (fixtures) or `BedrockParser` | `BedrockParser` | `MOCK_AI` |
| `AuthProvider` | `DevAuth` (HMAC-signed session token, no accounts) | `CognitoAuth` (JWT verified by API Gateway) | `AUTH` (`dev` / `cognito`) |

### 3.1. Rules That Keep Phase 1 Serverless-Compatible
1. **No in-memory state.** No session maps, no caches that correctness depends on. All state lives in DynamoDB or S3.
2. **No local file paths in core.** Images are only ever accessed through `ImageStorage`.
3. **Every request stands alone.** Assume the process can be killed between any two requests (as Lambda does).
4. **Config only from environment variables**, read once in the entry layer and passed into adapters.

---

## 4. The OCR Engine Decision: Amazon Bedrock vs. Amazon Textract

### 4.1. Why Amazon Textract Failed the Requirement
* **Language Barrier:** Amazon Textract currently supports only Latin-based alphabets (English, Spanish, German, French, etc.). It **cannot read Thai script** (ภาษาไทย), rendering it unusable for standard Thai receipts.
* **Layout Rigidity:** Traditional OCR outputs raw bounding boxes. Correlating Thai dish names to right-aligned prices across folded or skewed receipts requires complex, brittle heuristic code.

### 4.2. Why Amazon Bedrock (Multimodal LLM) Won
* **Native Thai & English Fluency:** Current Claude Haiku-class vision models on Bedrock handle mixed Thai-English receipts. The exact model ID and region are confirmed in the Milestone 1 POC.
* **Schema-Enforced JSON Extraction:** The extraction schema (see `04-THAI_RECEIPT_PATTERNS.md`) is supplied as a tool-use input schema, so the model's output is structured JSON validated against the schema rather than relying on prompt instructions alone.
* **Cost Efficiency:** Estimated **~$0.001–$0.005 per receipt** (to be measured in the POC), running entirely within the user's AWS account boundaries.

---

## 5. End-to-End Image & OCR Flow

The flow is identical in both phases; only the storage endpoint differs (MinIO in Docker, S3 on AWS).

1. **Client Request:** The client requests a presigned upload from the API (`POST /api/receipts/upload-url`). The backend returns a presigned POST (URL + form fields) limited to `image/jpeg`, max 5 MB, short expiry.
2. **Direct Upload:** The client compresses the image in the browser (§8) and uploads it directly to the storage bucket using the presigned POST. The API never handles image bytes.
3. **Trigger Processing:** The client calls `POST /api/receipts/{id}/parse`.
4. **Vision Extraction:** The handler reads the image through `ImageStorage`, sends it to the `ReceiptParser` (Bedrock or mock), validates the response against the schema, and converts decimal Baht to integer satang.
5. **Database Persistence:** The parsed bill, items, and calculation config are saved through `BillRepository`.
6. **Client Review:** The client receives the structured bill, rendering the "Review & Reconcile" editor.

---

## 6. Data Model (Amazon DynamoDB)

### 6.1. Table Structure: `HarnGun_Main`
On-demand single table with partition key (`PK`) and sort key (`SK`). The table and index definition lives in one file (`server/db/table-def.ts`), used by the local bootstrap; `template.yaml` must mirror it.

All money attributes are **integer satang**.

| Entity | PK | SK | Key Attributes |
|---|---|---|---|
| **User Profile** (Phase 2) | `USER#<userId>` | `PROFILE` | `email`, `displayName`, `promptPayId`, `promptPayType` (PHONE / NATIONAL_ID), `createdAt` |
| **Bill** | `BILL#<billId>` | `METADATA` | `hostId`, `hostName`, `promptPayId`, `promptPayType`, `title`, `restaurantName`, `status` (DRAFT, ACTIVE, SETTLED), `version`, `calcConfig` (`serviceChargePct`, `vatPct`, `vatMode`, `discountTiming`), `billDiscounts`, `roundingAdjustment`, `scannedGrandTotal`, `receiptImageKey`, `createdAt`, `updatedAt`, `GSI1PK=HOST#<hostId>`, `GSI1SK=<createdAt>` |
| **Item** | `BILL#<billId>` | `ITEM#<itemId>` | `name`, `quantity`, `unitPrice`, `totalPrice`, `itemDiscount`, `modifiers`, `needsReview`, `parentItemId` (set when unpacked), `sortOrder` |
| **Participant** | `BILL#<billId>` | `PARTICIPANT#<participantId>` | `name`, `colorIndex`, `isHost`, `isPaid`, `createdAt` |
| **Claim** | `BILL#<billId>` | `CLAIM#<itemId>#<participantId>` | `createdAt`, `createdBy` |

* **One query loads a whole bill:** `Query PK = BILL#<billId>` returns metadata, items, participants, and claims together.
* **Host history (Phase 2):** `GSI1` on `GSI1PK` / `GSI1SK`.
* **Claims are separate items** so two people claiming at the same moment never overwrite each other. Claim/unclaim is a `TransactWriteItems` of the claim `Put` (with `attribute_not_exists`) or `Delete`, plus an `UPDATE ... ADD version 1` on `METADATA`.
* **Every mutation increments `version`** on `METADATA` (used by polling, §9).
* **Shares are not stored.** Per-person totals are computed on read by the shared math engine, so they can never go stale.

---

## 7. Security & Privacy
* **Short Image Retention:** Storage lifecycle rule expires raw receipt images after **7 days** (S3 lifecycle in AWS, bucket lifecycle rule on MinIO).
* **Upload Constraints:** Presigned POST policies restrict uploads to `image/jpeg`, max 5 MB (`content-length-range`), under a server-generated object key, with a short expiry.
* **Authentication:**
  * Phase 1: `DevAuth` issues an HMAC-signed session token (secret from `DEV_AUTH_SECRET`). Local only, never deployed.
  * Phase 2: AWS Cognito User Pool with JWT validation by the API Gateway HTTP API authorizer.
* **Guest Access (Phase 2, Mode B):** Guests receive a signed token scoped to one bill, expiring after 24 hours, with no Cognito account.
* **Host Controls:** The Host can override any claim and lock the bill to stop further claiming.

---

## 8. Client-Side Image Compression Pipeline
* **Trigger:** `<input type="file" accept="image/*" capture="environment">` invokes the native smartphone camera.
* **HTML5 Canvas Downscaling:**
  * Longest edge constrained to **2000px** (preserves sharp Thai diacritics and tiny thermal printer text).
  * JPEG compression quality: **0.80**.
  * Image size reduced from ~8–12MB down to **~400–800KB**.
* **Direct Upload:** The presigned POST allows direct upload to storage, bypassing API Gateway payload limits (10MB) and eliminating Lambda binary decoding overhead.

---

## 9. Real-Time State Synchronization (Smart Polling)
* **Strategy:** Lightweight HTTP polling via SWR / React Query.
* **Frequency:** Every **3 seconds** while a session is active and the page is visible (`document.visibilityState === 'visible'`).
* **Mechanism:** The client calls `GET /api/bills/{id}?since=<version>`. The server reads only the bill's `METADATA` item (a single cheap read). If `version` is unchanged it returns `304 Not Modified`; otherwise it runs the full bill query and returns the updated bill.
* **Roadmap:** WebSocket upgrade path reserved for later if real-time claim animations are needed.

---

## 10. PromptPay Settlement Architecture
* **Generation:** 100% Client-Side.
* **Standard:** EMVCo QR code payload (Merchant Presented Mode) with Thailand National ID / Phone tag (`000201...`) and standard CRC-16 (CCITT-FALSE) checksum calculation.
* **Advantages:** Zero server compute, zero network latency, renders dynamically to HTML5 `<canvas>` or `<svg>`.
