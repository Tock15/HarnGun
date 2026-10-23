# HarnGun (หารกัน) - OS Course Project Requirements & Docker Architecture

## 1. Academic Context & Submission Checklist
* **Course:** Operating Systems (OS)
* **Project Type:** Individual Containerized System Project
* **Deliverables Checklist:**
  - [ ] **1. Source Code:** Complete application repository (`client`, `server`, `shared`).
  - [ ] **2. Dockerfiles:** Multi-stage production `Dockerfile` for frontend and backend.
  - [ ] **3. docker-compose.yml:** Multi-container orchestration (Web + API + DB + Object Storage).
  - [ ] **4. README.md:** Clear, foolproof setup instructions (`docker compose up --build`).
  - [ ] **5. Written Report (5–8 pages PDF):** Architecture, OS container concepts, and AI integration.
  - [ ] **6. Video Demo (10+ minutes with face):** Live execution, container inspection, and AI walkthrough.

---

## 2. Multi-Container Docker Architecture

```
                         Browser (http://localhost)
                                    |
                                    | :80 (only published port)
+-----------------------------------|-------------------------------------------+
|                 DOCKER COMPOSE USER-DEFINED BRIDGE (harngun_net)              |
|                                   v                                           |
|                        +--------------------+                                 |
|                        |      frontend      |                                 |
|                        |  (Nginx + React)   |                                 |
|                        |  Port: 80          |                                 |
|                        +----+----------+----+                                 |
|              /api proxy     |          |   /harngun-receipts/ proxy          |
|                             v          v                                      |
|          +--------------------+      +--------------------+                  |
|          |      backend       |----->|      storage       |                  |
|          |  (Node.js Express) |      |  (MinIO, S3 API)   |                  |
|          |  Port: 3000        |      |  Port: 9000        |                  |
|          +---------+----------+      +---------+----------+                  |
|                    |                           |                              |
|                    v http://database:8000      |                              |
|          +--------------------+                |                              |
|          |      database      |                |                              |
|          |  (DynamoDB Local)  |                |                              |
|          |  Port: 8000        |                |                              |
|          +---------+----------+                |                              |
+--------------------|---------------------------|------------------------------+
                     v                           v
           [Named Volume: db_data]     [Named Volume: minio_data]
```

Only `frontend` publishes a port to the host. `backend`, `database`, and `storage` are reachable only inside the Docker network (debug port mappings can be added in a `docker-compose.override.yml`).

---

## 3. Container Services Specification

### Service 1: `frontend`
* **Base Image:** `node:22-alpine` (builder) $\rightarrow$ `nginx:alpine` (production).
* **Role:**
  * Serves the compiled React single-page app.
  * Reverse-proxies `/api/` → `backend:3000`.
  * Reverse-proxies `/harngun-receipts/` → `storage:9000` **without rewriting the path**, passing the original `Host` header, so presigned requests verify correctly and the browser uploads to the same origin (no CORS needed locally, and phones on the same Wi-Fi can use the laptop's IP).
* **Exposed Port:** `80:80` (or `8080:80` if port 80 is taken).

### Service 2: `backend`
* **Base Image:** multi-stage build → `node:22-alpine`, runs as a non-root user.
* **Role:** Express wrapper around the core handlers (receipt upload URLs, AI parsing, bill state).
* **Startup bootstrap:** creates the `HarnGun_Main` table and the `harngun-receipts` bucket (with a 7-day lifecycle rule) if they don't exist, retrying with backoff until `database` and `storage` respond.
* **Depends on:** `database` and `storage` with `condition: service_healthy`.
* **Environment Configuration:**
  * `DATABASE_ENDPOINT=http://database:8000`
  * `TABLE_NAME=HarnGun_Main`
  * `S3_ENDPOINT=http://storage:9000` (backend → MinIO, internal)
  * `S3_PUBLIC_ENDPOINT=http://localhost` (host used in presigned URLs; must match the origin the browser uses)
  * `S3_BUCKET=harngun-receipts`, `S3_FORCE_PATH_STYLE=true`
  * `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (MinIO credentials, passed explicitly to the S3 client)
  * `AUTH=dev`, `DEV_AUTH_SECRET=<random>`
  * `MOCK_AI=true` (default for grading without AWS credentials)
  * `BEDROCK_REGION`, `BEDROCK_MODEL_ID` (set to the values confirmed in the Milestone 1 POC; used only when `MOCK_AI=false`)
* **Credential separation:** DynamoDB Local and MinIO get explicit local credentials; only the Bedrock client uses the standard AWS credential chain. This prevents local dummy keys from colliding with real AWS keys used for live Bedrock.

### Service 3: `database`
* **Base Image:** `amazon/dynamodb-local`, started with `-sharedDb -dbPath /home/dynamodblocal/data`.
* **Role:** Emulates Amazon DynamoDB.
* **Port:** `8000` (internal).
* **Volume:** `db_data:/home/dynamodblocal/data` (demonstrating persistent storage in the OS report).
* **Healthcheck:** command validated during setup.

### Service 4: `storage`
* **Base Image:** `minio/minio` at a **pinned release tag** (chosen during setup).
* **Role:** S3-compatible object storage for receipt images.
* **Port:** `9000` (S3 API, internal); console `9001` optional via override file for the demo.
* **Volume:** `minio_data:/data`.
* **Environment:** `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (same values as the backend's `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`).
* **Healthcheck:** command validated during setup.

---

## 4. Key OS Concepts to Cover in the 5–8 Page Report

1. **Process Isolation:** How Docker uses Linux **Namespaces** (`pid`, `net`, `ipc`, `mnt`, `uts`) to isolate the web server, API, database, and object store from each other.
2. **Resource Management:** How Linux **cgroups** (Control Groups) can restrict CPU and memory consumption per container (e.g., capping the Java-based DynamoDB Local).
3. **Virtual Bridge Networking:** How the Docker daemon creates a user-defined bridge network and provides internal DNS resolution (`http://database:8000`, `http://storage:9000`), and why only `frontend` publishes a port.
4. **Filesystem Layers & Multi-Stage Builds:** How copy-on-write (OverlayFS) and multi-stage Dockerfiles reduce final image attack surface and size.
5. **Storage & Persistence:** The difference between ephemeral container storage and named volumes (`db_data`, `minio_data`): data survives `docker compose down` but not `down -v`.
6. **Startup Ordering & Health:** Healthchecks, `depends_on: service_healthy`, and why the backend still retries (a healthy container is not the same as a ready service).

---

## 5. AI Integration Chapter (For Report Requirement #5)

1. **Multimodal LLM vs. Traditional OCR:** Why traditional OCR (Tesseract / AWS Textract) fails on complex Thai scripts and skewed receipts, and how LLM Vision understands semantic restaurant context.
2. **Deterministic Extraction:** A tool-use input schema enforcing the JSON structure, and null-handling (`needsReview`) for illegible text.
3. **Math Guard Reconciler:** Algorithmic balance check comparing the Grand Total computed from items and the bill's calculation config (SC, VAT inclusive/exclusive, discount timing) against the scanned Grand Total, mitigating AI hallucination risks.

---

## 6. Architecture Parity: Production (AWS-Native) vs. Local Dev (Docker)

HarnGun is **AWS-native in its DNA**. Docker serves as the local packaging and process-isolation layer that mirrors the AWS cloud on a local laptop. The **core handlers are identical** in both environments; only the adapters differ, selected by environment variables (`02-ARCHITECTURE.md` §3):

| Component | **Production (AWS, Phase 2)** | **Local (Docker, Phase 1)** | How Code Remains Identical |
|---|---|---|---|
| **Frontend** | **S3 + CloudFront CDN** | **Nginx Alpine Container** (Port 80) | Identical compiled React bundle (`dist/`). |
| **Backend API** | **API Gateway + Lambda** | **Node.js Express Container** | Same `server/core` handlers; wrapped by `server/lambda` or `server/express`. |
| **Database** | **Amazon DynamoDB** | **`amazon/dynamodb-local`** + `db_data` volume | Same DynamoDB adapter and AWS SDK v3 client; `DATABASE_ENDPOINT` set locally, unset in AWS. |
| **File Storage** | **Amazon S3** (presigned POST) | **MinIO** + `minio_data` volume (presigned POST) | Same S3 adapter; `S3_ENDPOINT` set locally, unset in AWS. Client upload code is identical. |
| **Auth** | **Cognito** (JWT authorizer) | **`DevAuth`** (signed session token) | Both implement `AuthProvider`; selected by `AUTH`. |
| **AI Vision** | **Amazon Bedrock** | **Live Bedrock** OR `MOCK_AI=true` fixtures | Both implement `ReceiptParser`; selected by `MOCK_AI`. |
