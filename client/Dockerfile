# ---------- Stage 1: build (Vite → static files, thrown away) ----------
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

COPY client/ client/
COPY shared/ shared/
COPY tsconfig.base.json ./

RUN npm run build -w client

# ---------- Stage 2: runtime (Nginx + static files) ----------
FROM nginx:alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
