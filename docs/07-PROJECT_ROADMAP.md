# HarnGun (หารกัน) - Project Roadmap

The project runs in two phases:
* **Phase 1 — OS Course Submission (7 days, due ~2026-10-30):** the full app running in Docker Compose with zero AWS credentials.
* **Phase 2 — AWS Serverless:** the same core handlers deployed to Lambda, plus the features deferred from Phase 1.

---

## Phase 1 — OS Course Submission

Scope: Mode A (host-assigned) only, `DevAuth` (no accounts), MinIO + DynamoDB Local, `MOCK_AI=true` by default with live Bedrock when credentials are present. See `01-PRD.md` §5.

### Day 1: Bedrock POC + `shared/` Core
* **Bedrock POC (de-risks the core engine):**
  - [ ] Confirm a current Claude Haiku-class vision model ID and a Bedrock region with access enabled.
  - [ ] Gather 2–3 real Thai receipts (inclusive-VAT cafe, exclusive +10% +7% restaurant, thermal slip with modifiers).
  - [ ] Lightweight script calling Bedrock with the tool-use schema from `04-THAI_RECEIPT_PATTERNS.md`.
  - [ ] Verify `null` / `needsReview` guardrails and schema conformance; measure cost per receipt.
  - [ ] Save outputs as `server/fixtures/*.json` (used by `MOCK_AI=true`).
* **`shared/` domain & math core:**
  - [ ] Shared TypeScript types (`Bill`, `Item`, `Participant`, `Claim`, `CalcConfig`).
  - [ ] Calculation engine in integer satang with all `vatMode` × `discountTiming` combinations.
  - [ ] Largest-remainder allocation (item splitting + per-person totals), deterministic tie-break.
  - [ ] PromptPay EMVCo payload generator with CRC-16 checksum.
  - [ ] Unit tests covering rounding edge cases, every calc mode, and the fixture receipts.

### Day 2: Backend Core + Express
  - [ ] Port interfaces (`BillRepository`, `ImageStorage`, `ReceiptParser`, `AuthProvider`).
  - [ ] Core handlers: create upload URL, parse receipt, get bill (with `?since=version`), update bill, claim/unclaim, unpack item.
  - [ ] Adapters: DynamoDB, S3 (MinIO-compatible, presigned POST), mock parser, Bedrock parser, `DevAuth`.
  - [ ] `table-def.ts` + local bootstrap (create table and bucket with 7-day lifecycle if missing).
  - [ ] Express wrapper; run locally against DynamoDB Local + MinIO containers.

### Day 3: Frontend Flow
  - [ ] Scaffold `client/` with Vite + React + TypeScript; design tokens from `06-UI_DESIGN_SYSTEM.md`.
  - [ ] Host session screen (name + PromptPay ID).
  - [ ] Camera capture + Canvas compressor (2000px, JPEG 0.80) + presigned POST upload.
  - [ ] Review & Reconcile screen: inline edits, calc config toggles, unpacking, Math Guard.
  - [ ] Mode A assignment screen, settlement cards, PromptPay QR, copy-to-LINE summary.

### Day 4: Docker
  - [ ] Multi-stage `client/Dockerfile` (node build → `nginx:alpine`) + `nginx.conf` (SPA, `/api` proxy, bucket path proxy).
  - [ ] Multi-stage `server/Dockerfile` (build → `node:22-alpine`, non-root user).
  - [ ] `docker-compose.yml`: `frontend`, `backend`, `database`, `storage`; volumes `db_data`, `minio_data`; healthchecks; `depends_on: service_healthy`.
  - [ ] `README.md` with one-command setup.
  - [ ] Test from a fresh clone on a clean machine state (`docker compose down -v` first).

### Day 5: Buffer
  - [ ] Bug fixes and polish.
  - [ ] Verify PromptPay QR scans in K PLUS / SCB EASY with a real small amount.

### Day 6: Written Report (5–8 pages)
  - [ ] Architecture + container topology.
  - [ ] OS concepts with evidence from the running containers (`docker inspect`, `/proc`, namespaces, cgroups, `docker network inspect`, volume persistence demo). See `08-OS_COURSE_REQUIREMENTS.md` §4.
  - [ ] AI integration chapter.

### Day 7: Video Demo + Submit
  - [ ] 10+ minute video with face: setup from scratch, full app walkthrough, container inspection, live Bedrock scan.
  - [ ] Submit.

---

## Phase 2 — AWS Serverless

### Milestone 2.1: Lambda + SAM
  - [ ] Lambda entry points in `server/lambda/` wrapping the same core handlers.
  - [ ] `template.yaml`: HTTP API, Lambdas, DynamoDB table (mirroring `table-def.ts`), S3 receipts bucket with 7-day lifecycle + CORS.
  - [ ] Test with `sam local start-api`, then `sam build && sam deploy --guided`.
  - [ ] Verify IAM permissions in the cloud (DynamoDB Local and MinIO do not enforce IAM).

### Milestone 2.2: Cognito Auth
  - [ ] Cognito User Pool + HTTP API JWT authorizer.
  - [ ] `CognitoAuth` adapter; saved host profile with PromptPay ID.

### Milestone 2.3: Mode B Interactive Room
  - [ ] Room link / QR, bill-scoped 24h guest tokens.
  - [ ] Smart Polling hook (`useBillSync`) with `version` / `304`.
  - [ ] Host override and bill lock.

### Milestone 2.4: Frontend Deploy & History
  - [ ] Deploy frontend to S3 + CloudFront.
  - [ ] Host history via `GSI1`.
  - [ ] End-to-end test on mobile: camera upload → Bedrock → claiming → PromptPay QR scan.

### Optional: Design Drafts (Figma / Penpot)
  - [ ] Refine screens visually once the Phase 1 flow is proven.
