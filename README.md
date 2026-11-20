# HarnGun (หารกัน)

Split a restaurant bill with friends. Scan the receipt, check the items, tap who ate what, and each person gets their share with a PromptPay QR code.

The app runs as four Docker containers. The AI receipt reader is mocked by default, so no cloud account or API key is needed. The same code also deploys to AWS as a serverless app; see [Deploy to AWS](#deploy-to-aws).

## Quick start

Requirements: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with the Compose plugin) and Git.

```bash
git clone <repo-url> harngun
cd harngun
docker compose up --build
```

Wait for the four containers to report healthy (the first build takes a few minutes), then open **http://localhost:8080**.

To use it on a phone, connect the phone to the same Wi-Fi and open `http://<your computer's IP>:8080`. If the page doesn't load, allow port 8080 through the computer's firewall.

Stop with `Ctrl+C`, or `docker compose down` if you started it with `-d`.

## Architecture

```
Browser ──:8080──▶ frontend (Nginx + React)
                     ├── /                   static files
                     ├── /api/            ──▶ backend  (Node.js, Express)  :3000
                     └── /harngun-receipts ──▶ storage  (RustFS, S3 API)    :9000
                                               backend ──▶ database (DynamoDB Local) :8000
```

| Service | Image | Role | Data |
|---|---|---|---|
| `frontend` | `client/Dockerfile` → `nginx:alpine` | Serves the React app; proxies the API and photo uploads, so the browser talks to one address | none |
| `backend` | `server/Dockerfile` → `node:22-alpine` | REST API; creates the table and bucket on startup | none |
| `database` | `amazon/dynamodb-local` | Bills, items, participants | volume `db_data` |
| `storage` | `rustfs/rustfs` | Receipt photos (S3-compatible) | volume `storage_data` |

Only `frontend` publishes a port. The other three are reachable only inside the Compose network, by service name (`http://database:8000`). Startup order is enforced by healthchecks: `backend` waits for `database` and `storage`, and `frontend` waits for `backend`.

Both Dockerfiles are multi-stage: a Node build stage compiles the code, and only the result is copied into the final image. The backend ships as a single bundled `server.mjs` and runs as the non-root `node` user.

## Commands

```bash
docker compose up -d --build     # build and start in the background
docker compose ps                # status and health of each container
docker compose logs -f backend   # follow one service's logs
docker compose down              # stop; bills and photos are kept
docker compose down -v           # stop and delete all data (fresh start)
```

## Configuration

All settings are environment variables on `backend` in `docker-compose.yml`. The values there are local development placeholders, not secrets.

| Variable | Default | Meaning |
|---|---|---|
| `MOCK_AI` | `true` | `true` returns a sample receipt instead of calling an AI model |
| `DATABASE_ENDPOINT` | `http://database:8000` | DynamoDB Local; unset means real AWS |
| `S3_ENDPOINT` | `http://storage:9000` | RustFS; unset means real AWS |
| `AUTH` / `DEV_AUTH_SECRET` | `dev` | Local sign-in with a signed token |

## Development without Docker for the app

Runs only the database and storage in Docker, and the app with hot reload. Requires Node.js 22.9+.

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # DynamoDB Local :8000, RustFS :9000
npm run dev -w server                            # API on :3000
npm run dev -w client                            # app on :5173
npm test                                         # unit tests
npm run test:integration                         # needs the dev containers
npm run typecheck
```

### Real receipt scans (optional)

By default the API returns a sample receipt. To read real photos with Google's Gemini API, create `server/.env` (git-ignored; it overrides `server/dev.env`):

```bash
MOCK_AI=false
GEMINI_API_KEY=<your key from aistudio.google.com>
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart `npm run dev -w server`; the startup line names the parser. Development only: the Docker stack always uses the sample receipt.

## Deploy to AWS

```
Browser ──▶ CloudFront (harngun.tock15.dev)
              ├── /        ──▶ S3 frontend bucket (private, read through OAC)
              └── /api/*   ──▶ API Gateway (HTTP API, throttled) ──▶ 3 Lambdas ──▶ DynamoDB
Photos: browser ──▶ S3 receipts bucket directly (presigned POST)
Receipt reading: ParseReceipt Lambda ──▶ Google Gemini API
```

Everything is one SAM stack defined in `template.yaml`. The three Lambdas share one bundle (`server/lambda/index.ts`) and differ only in their routes, permissions and timeouts: `UploadUrl` signs photo uploads, `ParseReceipt` reads receipts with Gemini, and `Bills` serves every other route.

Requirements: Node.js, [AWS CLI v2](https://aws.amazon.com/cli/), [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html), a domain whose DNS you control, and a Gemini API key. On Windows, run `sam` from PowerShell. The commands use the AWS profile `harngun` and region `ap-southeast-1` (set in `samconfig.toml`).

**One-time setup**

1. Sign in: `aws login --profile harngun`.
2. Store the two secrets in SSM Parameter Store. The Lambdas read them at cold start, so they are never in the template or the code.
   ```bash
   aws ssm put-parameter --name /harngun/dev-auth-secret --type SecureString --value "<a long random string>" --profile harngun
   aws ssm put-parameter --name /harngun/gemini-api-key --type SecureString --value "<your Gemini key>" --profile harngun
   ```
3. Request a TLS certificate. It must be in `us-east-1`, because CloudFront only reads certificates from there:
   ```bash
   aws acm request-certificate --domain-name harngun.tock15.dev --validation-method DNS --region us-east-1 --profile harngun
   ```
   Add the CNAME record from `aws acm describe-certificate` at your DNS provider, wait for the status `ISSUED`, and put the certificate ARN in `samconfig.toml` as `parameter_overrides = "CertificateArn=..."`. To use another domain, also change `Aliases` in `template.yaml`.

**Deploy**

```bash
npm run sam:build         # bundle the Lambdas; run it after every template change too
sam deploy                # shows a changeset and asks before applying it
npm run deploy:frontend   # build the client, upload it to S3, clear the CloudFront cache
```

After the first deploy, point a CNAME for your domain at the `FrontendDomain` stack output (`dxxxx.cloudfront.net`).

Check a template with `sam validate --lint`; plain `sam validate` does not check property names on non-SAM resources.

**Limits and costs**

* API Gateway allows 10 requests/s (burst 20), and 1/s on receipt parsing. A Gemini call is cut off at 25 s, because API Gateway ends every request at 30 s.
* Lambda logs are kept for 14 days.
* At hobby traffic the stack stays within the AWS free allowances.
* Emergency stop: `aws apigatewayv2 update-stage --api-id <api id> --stage-name '$default' --default-route-settings ThrottlingRateLimit=0,ThrottlingBurstLimit=0 --profile harngun`.

**Remove everything:** empty both buckets with `aws s3 rm s3://<bucket> --recursive`, then run `sam delete`. This deletes the bills table and its data.

## Repository layout

```
client/        React app (Vite), its Dockerfile and nginx.conf
server/        API: core logic, ports and adapters (DynamoDB, S3, AI parser), Express and Lambda entry points, Dockerfile
shared/        Money math, bill splitting, PromptPay payload; used by both client and server
template.yaml  AWS SAM stack: Lambdas, API Gateway, DynamoDB, S3, CloudFront
scripts/       deploy-frontend.mjs (uploads the client to AWS)
```

## Troubleshooting

* **Port 8080 is already in use:** change `"8080:80"` under `frontend` in `docker-compose.yml`, e.g. to `"8081:80"`.
* **A container stays unhealthy:** `docker compose logs <service>` shows why.
* **Strange data after code changes:** `docker compose down -v` and start again.
