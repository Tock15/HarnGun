# ---------- Stage 1: build (full toolbox, thrown away) ----------
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

COPY server/ server/
COPY shared/ shared/
COPY tsconfig.base.json ./

RUN npm run build -w server

# ---------- Stage 2: runtime (Node + one file) ----------
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/server/dist/server.mjs ./

USER node

EXPOSE 3000

CMD ["node", "server.mjs"]
