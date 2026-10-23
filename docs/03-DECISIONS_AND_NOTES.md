# HarnGun (หารกัน) - Decision Log & Discussion Notes

## 1. Architectural Decision Records (ADRs)

### ADR-001: Cloud Platform & Architecture Pattern
* **Status:** Accepted
* **Decision:** Three-Tier Serverless Web App on AWS.
* **Rationale:** Zero idle server maintenance, scales to zero when not in use, lowest operational cost for an MVP.
* **Services:** S3 + CloudFront (Frontend), API Gateway + Lambda (API), DynamoDB (Data), Cognito (Auth).

### ADR-002: OCR & Vision Provider
* **Status:** Accepted
* **Decision:** Amazon Bedrock with a current Claude Haiku-class vision model (exact model ID and region verified in the Milestone 1 POC) instead of Amazon Textract.
* **Rationale:** Textract does not support the Thai language (Thai script). Bedrock models are bilingual, native to AWS, and cost fractions of a cent per bill. Output structure is enforced by supplying the extraction schema as a tool-use input schema rather than relying on prompt instructions alone.

### ADR-003: User Participation & Collaboration Model
* **Status:** Accepted
* **Decision:** Hybrid Model (Registered Host + Frictionless Guest Claimers / Host Assignment).
* **Rationale:** Forcing all participants to create accounts while dining introduces massive friction. Allowing guest participation via room links/QR codes or host-driven assignments ensures fast adoption.
* **Phasing:** Phase 1 ships Host Assignment (Mode A) only; guest rooms (Mode B) are Phase 2.

### ADR-004: PromptPay QR Generation
* **Status:** Accepted
* **Decision:** Client-Side Generation using EMVCo standard payload calculation.
* **Rationale:** PromptPay QR codes are deterministic checksums based on recipient ID (Phone/National ID) and amount in Baht. Generating on the frontend eliminates Lambda compute costs, removes network latency, and allows instant offline rendering on HTML5 Canvas / SVG.

### ADR-005: Live Room State Synchronization
* **Status:** Accepted
* **Decision:** Smart Polling (SWR / React Query) every 3 seconds, using a bill `version` counter.
* **Rationale:** Vastly simpler to implement and maintain than WebSocket connection pooling and disconnect listeners. Restaurant mobile data connections are frequently interrupted; stateless HTTP polling is resilient and costs pennies. Each poll reads only the bill's `METADATA` item; if `version` is unchanged the server returns `304`, otherwise the full bill. WebSockets remain on the roadmap if real-time claim animations are required.

### ADR-006: Mobile Camera Capture & Image Optimization Pipeline
* **Status:** Accepted
* **Decision:** Native file input capture + Client-Side Canvas Compression prior to Direct Upload.
* **Rationale:** Smartphone cameras produce 5MB–15MB photos. The browser downscales images to a longest edge of 2000px at 80% JPEG quality (~400KB–800KB). This preserves crisp Thai font glyphs for Bedrock while minimizing upload latency and token consumption. Files are uploaded directly to S3 (or MinIO locally) via presigned POST.

### ADR-007: OCR Verification & "Reconciliation" UX
* **Status:** Accepted
* **Decision:** "Review & Reconcile" verification screen with inline editing and a Math Guard.
* **Rationale:** Receipts can be crumpled, faded, or handwritten. Before proceeding to bill splitting, the user reviews a collapsible thumbnail of the original bill side-by-side with extracted items. An automatic reconciliation validator compares the Grand Total computed from the items and the bill's calculation config (SC, VAT mode, discount timing) against the scanned Grand Total, alerting the user to any mathematical discrepancies.

### ADR-008: Full-Stack TypeScript with Shared Domain/Calculation Core
* **Status:** Accepted
* **Decision:** Full-Stack TypeScript monorepo layout (`client/`, `server/`, `shared/`). Frontend in React + Vite (TypeScript); Backend in Node.js 22 LTS (TypeScript).
* **Rationale:**
  1. Allows sharing the identical financial calculation engine (compound SC + VAT, satang rounding) and PromptPay EMVCo encoder between frontend (instant 0ms recalculation on UI interactions) and backend (canonical persistence validation).
  2. End-to-end type safety eliminates synchronization errors across API payloads.
  3. Node.js Lambda runtime delivers ultra-low cold start times (100–250ms).

### ADR-009: Infrastructure as Code (IaC) via AWS SAM
* **Status:** Accepted (Phase 2)
* **Decision:** AWS SAM (Serverless Application Model) with `template.yaml`.
* **Rationale:**
  1. Purpose-built by AWS for serverless architectures (Lambda, API Gateway, DynamoDB, S3, Cognito).
  2. Declarative single YAML configuration that can be generated and managed without requiring deep programmatic IaC abstractions.
  3. Supports local development and debugging with `sam local start-api`.
  4. Straightforward, interactive 1-command deployment (`sam build && sam deploy --guided`).

### ADR-010: Multi-Container Docker Architecture for Local Dev & Academic Submission
* **Status:** Accepted (Phase 1)
* **Decision:** Implement multi-stage `Dockerfile` configurations and a `docker-compose.yml` orchestrating four container services: `frontend` (React + Nginx Alpine), `backend` (Node.js Express wrapper around the core handlers), `database` (DynamoDB Local), and `storage` (MinIO, S3-compatible), with named volume persistence.
* **Rationale:**
  1. Fulfills the Operating Systems (OS) course project requirements for multi-tier process isolation, container networking, and storage volumes.
  2. Guarantees that professors and evaluators can run the full system locally via `docker compose up --build` with **zero AWS credentials**: every AWS dependency has a local adapter (ADR-011) — DynamoDB Local, MinIO, `DevAuth`, and `MOCK_AI=true`.
  3. The identical core handlers are deployed either containerized (Docker, Phase 1) or serverless (AWS Lambda, Phase 2).
* **Storage emulator choice:** MinIO (pinned image tag) over LocalStack, because LocalStack requires an auth token since March 2026, which would break the zero-credentials guarantee. Floci is the fallback if MinIO causes problems.

### ADR-011: Ports & Adapters Dual Runtime
* **Status:** Accepted
* **Decision:** Business logic lives in `server/core/` as plain functions that receive their dependencies through interfaces (`BillRepository`, `ImageStorage`, `ReceiptParser`, `AuthProvider`). Thin entry layers (`server/express/`, `server/lambda/`) wire adapters from environment variables.
* **Rationale:**
  1. Lets one codebase run in Docker for the OS course and on Lambda for the serverless goal, without duplicating logic.
  2. Core handlers are unit-testable without AWS or Docker.
  3. Enforces serverless-safe habits during Phase 1 (no in-memory state, no file paths, stateless requests).

### ADR-012: Integer Satang Money Representation
* **Status:** Accepted
* **Decision:** All money is stored and calculated as integer satang. Decimal Baht exists only at the boundaries (AI output parsing, UI display, PromptPay payload). Penny balancing uses the integer largest-remainder method with deterministic tie-breaking by participant order.
* **Rationale:** Floating-point Baht arithmetic produces off-by-one-satang errors, and the client and server must compute identical results. Integer math plus a fixed tie-break rule guarantees shares sum exactly to the Grand Total on both sides.

---

## 2. Target Repository Directory Structure

```text
HarnGun/
├── docs/                       # PRD, Architecture, and Decision Records
├── shared/                     # Isomorphic TypeScript domain library (no I/O)
│   ├── types/                  # Bill, Item, Participant, Claim, CalcConfig interfaces
│   ├── math/                   # SC + VAT engine (calc modes), satang allocation, penny balancing
│   └── promptpay/              # EMVCo CRC-16 payload generation logic
├── client/                     # Tier 1: Frontend SPA (React + Vite + TypeScript)
│   ├── Dockerfile              # Multi-stage: node build → nginx:alpine
│   ├── nginx.conf              # SPA serving + /api and storage reverse proxy
│   └── src/
│       ├── components/         # CameraCapture, ReceiptEditor, DishClaimer, PromptPayModal
│       ├── hooks/              # useBillSync (Smart Polling), useAuth
│       └── styles/             # Vanilla CSS / CSS Tokens (mobile-first, thermal receipt theme)
├── server/                     # Tier 2: Backend (TypeScript)
│   ├── Dockerfile              # Multi-stage: build → node:22-alpine runtime
│   ├── fixtures/               # Mock receipt JSON for MOCK_AI=true
│   └── src/
│       ├── core/               # Handlers: createUploadUrl, parseReceipt, getBill, updateBill, claimItem
│       ├── ports/              # BillRepository, ImageStorage, ReceiptParser, AuthProvider interfaces
│       ├── adapters/           # dynamo, s3-storage, parser-mock, parser-bedrock, auth-dev, auth-cognito
│       ├── db/                 # table-def.ts, local bootstrap (create table + bucket)
│       ├── express/            # Docker entry point (Phase 1)
│       └── lambda/             # Lambda entry points (Phase 2)
├── docker-compose.yml          # Phase 1: frontend, backend, database, storage
└── template.yaml               # Phase 2: AWS SAM
```

---

## 3. Discussion Topics

1. ~~**AWS Infrastructure Deployment Tool**~~ — Resolved by ADR-009 (AWS SAM).
2. **Cognito Sign-up Methods (Phase 2):**
   * Confirming the sign-up methods (Email/Password + optional Google/LINE login).
3. **Bedrock Prompt & Schema (Milestone 1 POC):**
   * Validating the system prompt and tool-use schema against real, messy Thai receipts; the POC outputs become the `MOCK_AI` fixtures.
