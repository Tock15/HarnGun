# HarnGun (หารกัน)

Split a restaurant bill with friends. Scan the receipt, check the items, tap who ate what, and each person gets their share with a PromptPay QR code.

The app runs as four Docker containers. The AI receipt reader is mocked by default, so no cloud account or API key is needed.

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

Runs only the database and storage in Docker, and the app with hot reload. Requires Node.js 22+.

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # DynamoDB Local :8000, RustFS :9000
npm run dev -w server                            # API on :3000
npm run dev -w client                            # app on :5173
npm test                                         # unit tests
npm run test:integration                         # needs the dev containers
npm run typecheck
```

## Repository layout

```
client/   React app (Vite), its Dockerfile and nginx.conf
server/   API: core logic, ports and adapters (DynamoDB, S3, AI parser), Express entry point, Dockerfile
shared/   Money math, bill splitting, PromptPay payload; used by both client and server
```

## Troubleshooting

* **Port 8080 is already in use:** change `"8080:80"` under `frontend` in `docker-compose.yml`, e.g. to `"8081:80"`.
* **A container stays unhealthy:** `docker compose logs <service>` shows why.
* **Strange data after code changes:** `docker compose down -v` and start again.
