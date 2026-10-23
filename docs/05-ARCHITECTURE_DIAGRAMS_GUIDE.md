# HarnGun (หารกัน) - Architecture Diagramming Guide (for Eraser.io)

This document provides complete visual layouts, component breakdowns, and copy-pasteable diagram code for drawing the HarnGun system on [Eraser.io](https://eraser.io).

---

## 1. AWS Services Breakdown & Rationale (Phase 2)

| Service | Tier | Role in HarnGun | Cost Profile |
|---|---|---|---|
| **Amazon CloudFront** | Tier 1 (CDN) | Distributes web app assets globally, provides HTTPS/SSL certificate, and caches static JS/CSS. | Free tier eligible / fraction of a cent |
| **Amazon S3 (Frontend Bucket)** | Tier 1 (Hosting) | Hosts compiled React + Vite SPA static build files (`index.html`, `.js`, `.css`). | Negligible (~$0.01/mo) |
| **Amazon S3 (Receipts Bucket)** | Tier 2 (Storage) | Private bucket for temporary receipt photos. Configured with a 7-day TTL lifecycle expiration. | Fractions of a cent (images auto-expire) |
| **AWS Cognito** | Tier 2 (Auth) | Manages Host user identity, email/password signup, and JWT tokens. | 50,000 MAU free tier |
| **Amazon API Gateway** | Tier 2 (API Gateway) | HTTP API routing, CORS handling, and JWT authorization for incoming requests. | Free tier (1M calls/mo) |
| **AWS Lambda** | Tier 2 (Compute) | Node.js TypeScript serverless functions executing business logic on demand. | Free tier (1M requests/mo) |
| **Amazon Bedrock** | Tier 2 (AI Vision) | Current Claude Haiku-class vision model that extracts structured items, taxes, and prices from receipt photos. | ~$0.001–$0.005 per bill (measured in POC) |
| **Amazon DynamoDB** | Tier 3 (Database) | On-demand NoSQL database storing users, bills, items, participants, and claims. | 25GB free tier |

---

## 2. Production Cloud Architecture Diagram (Phase 2)

### 2.1. Visual Layout
* **Layer 1 (Left):** Users (Mobile Web Browsers - Host & Guests)
* **Layer 2 (Top Center):** Frontend static delivery (CloudFront CDN + S3 Website Bucket)
* **Layer 3 (Center):** Application compute (Cognito User Pool, API Gateway, Lambda functions)
* **Layer 4 (Right):** Storage, AI, and Database (S3 Receipts Bucket, Bedrock, DynamoDB)

### 2.2. Eraser.io Diagram-as-Code (Production)
Paste this directly into the Eraser.io Diagram-as-Code editor:

```eraser
group "Client Layer" {
  Host [icon: user, label: "Host (Mobile Web)"]
  Guest [icon: users, label: "Guest (Mobile Web)"]
}

group "Tier 1: Presentation (AWS)" {
  CloudFront [icon: aws-cloudfront, label: "CloudFront CDN"]
  S3Frontend [icon: aws-s3, label: "S3 (Web App Static Assets)"]
}

group "Tier 2: API & Compute (AWS)" {
  Cognito [icon: aws-cognito, label: "Cognito User Pool (Auth)"]
  APIGateway [icon: aws-api-gateway, label: "API Gateway (HTTP API)"]

  LambdaPresign [icon: aws-lambda, label: "Lambda: CreateUploadUrl"]
  LambdaParse [icon: aws-lambda, label: "Lambda: ParseReceipt"]
  LambdaBill [icon: aws-lambda, label: "Lambda: Bill & Claim Sync"]
}

group "Tier 3: Storage & AI (AWS)" {
  S3Receipts [icon: aws-s3, label: "S3: Raw Receipts (7-Day TTL)"]
  Bedrock [icon: aws-bedrock, label: "Bedrock: Claude Haiku-class"]
  DynamoDB [icon: aws-dynamodb, label: "DynamoDB (HarnGun_Main)"]
}

// Ingress & Frontend
Host > CloudFront: 1. Load Web App
Guest > CloudFront: 1. Load Web App
CloudFront > S3Frontend: Fetch Assets

// Auth & API
Host > Cognito: Auth & Login (JWT)
Host > APIGateway: 2. API Requests (JWT Auth)
Guest > APIGateway: Join Room / Poll Bill

// Routing
APIGateway > LambdaPresign: POST /api/receipts/upload-url
APIGateway > LambdaParse: POST /api/receipts/{id}/parse
APIGateway > LambdaBill: GET/PUT /api/bills/{id}

// Data Flow & AI
Host > S3Receipts: 3. Direct Upload Photo (Presigned POST)
LambdaParse > S3Receipts: Read Image
LambdaParse > Bedrock: 4. Extract Items & Taxes (JSON)
LambdaParse > DynamoDB: 5. Persist Bill & Items
LambdaBill > DynamoDB: Read / Write Claims
```

---

## 3. The 5-Step Production Data Flow

1. **Step 1: Web App Delivery**
   * Host and Guests navigate to the web URL. CloudFront fetches and caches static assets from S3.
2. **Step 2: Upload Authorization**
   * The Host taps *"Scan Bill"*. The client sends a `POST /api/receipts/upload-url` request to API Gateway.
   * `LambdaPresign` returns a time-limited presigned POST (JPEG only, max 5 MB).
3. **Step 3: Direct S3 Image Ingestion**
   * The client downscales the photo using HTML5 Canvas (~400–800KB) and uploads it directly to the private S3 receipts bucket. The API server is completely bypassed during upload.
4. **Step 4: AI Extraction**
   * The client triggers `POST /api/receipts/{id}/parse`.
   * `LambdaParse` reads the image from S3, sends it to Amazon Bedrock with the receipt extraction tool-use schema, and receives validated JSON.
5. **Step 5: Collaboration & Settlement**
   * Items are stored in DynamoDB. The Host verifies items on the "Review & Reconcile" screen.
   * Guests join via a Room QR / link. Smart Polling synchronizes dish claims every 3 seconds.
   * Individual settlement cards and PromptPay QR codes are calculated and displayed.

---

## 4. Local Docker Architecture (Phase 1 — OS Course)

### 4.1. Visual Layout
* **Host Machine:** Browser (`http://localhost`)
* **Docker Compose Network (`harngun_net`):**
  * `frontend` — Nginx serving the React build; reverse-proxies `/api` → `backend` and the receipts bucket path → `storage`.
  * `backend` — Node.js Express wrapper around the core handlers.
  * `database` — DynamoDB Local.
  * `storage` — MinIO (S3-compatible).
* **Named Volumes:** `db_data` (database), `minio_data` (storage).
* **Optional (dotted):** Live Amazon Bedrock when AWS credentials are provided; otherwise `MOCK_AI=true` fixtures.

### 4.2. Eraser.io Diagram-as-Code (Local Docker)

```eraser
Browser [icon: monitor, label: "Browser (localhost)"]

group "Docker Compose Network (harngun_net)" {
  Frontend [icon: nginx, label: "frontend: Nginx + React build (:80)"]
  Backend [icon: nodejs, label: "backend: Express + core handlers (:3000)"]
  Database [icon: aws-dynamodb, label: "database: DynamoDB Local (:8000)"]
  Storage [icon: database, label: "storage: MinIO S3 (:9000)"]
  Fixtures [icon: file-text, label: "Mock Receipt JSON (MOCK_AI=true)"]
}

group "Named Volumes" {
  DbData [icon: hard-drive, label: "db_data"]
  MinioData [icon: hard-drive, label: "minio_data"]
}

Bedrock [icon: aws-bedrock, label: "Amazon Bedrock (optional, live AI)"]

Browser > Frontend: Load app, /api calls, presigned upload
Frontend > Backend: Proxy /api
Frontend > Storage: Proxy receipts bucket path
Backend > Database: http://database:8000
Backend > Storage: http://storage:9000
Backend > Fixtures: MOCK_AI=true
Backend --> Bedrock: MOCK_AI=false (AWS creds)
Database > DbData: Persist tables
Storage > MinioData: Persist images
```

---

## 5. SAM Local Development Architecture (Phase 2)

### 5.1. Visual Layout
* **On Laptop:**
  * Browser (`http://localhost:5173`)
  * Vite Dev Server (React Hot-Module Replacement)
  * Local API via `sam local start-api` (`http://localhost:3000`)
  * Mock Data Mode (`MOCK_AI=true` flag for instant zero-cost local testing)
* **In AWS Sandbox (Cloud):**
  * Dev S3 Bucket (for real upload testing)
  * Real Bedrock (when testing live OCR parsing)
  * Dev DynamoDB Table

### 5.2. Eraser.io Diagram-as-Code (SAM Local)

```eraser
group "Local Machine (Your Laptop)" {
  LocalBrowser [icon: monitor, label: "Browser (localhost:5173)"]
  ViteDev [icon: react, label: "Vite Dev Server (Frontend TS)"]
  LocalBackend [icon: nodejs, label: "SAM Local API (localhost:3000)"]
  MockFixture [icon: file-text, label: "Mock Receipt JSON (MOCK_AI=true)"]
}

group "AWS Cloud (Dev Sandbox / Free Tier)" {
  DevS3 [icon: aws-s3, label: "Dev S3 Receipts Bucket"]
  DevBedrock [icon: aws-bedrock, label: "Amazon Bedrock (Claude Haiku-class)"]
  DevDynamoDB [icon: aws-dynamodb, label: "Dev DynamoDB Table"]
}

// Local Flow
LocalBrowser > ViteDev: Hot Module Reloading (UI Edits)
LocalBrowser > LocalBackend: API Requests (/api/bills, /api/receipts)
LocalBackend > MockFixture: Fast Local Tests ($0, 0ms)

// Cloud Integration (When Testing Real AWS Flow)
LocalBackend > DevS3: Test Presigned Uploads
LocalBackend > DevBedrock: Test Real Thai OCR (via AWS CLI Creds)
LocalBackend > DevDynamoDB: Test Table Persistence
```
