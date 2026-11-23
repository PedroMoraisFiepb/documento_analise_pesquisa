# syntax=docker/dockerfile:1

# ---------- deps: dependências completas (build) ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- build: compila TypeScript ----------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY mock ./mock
RUN npm run build

# ---------- runtime: só dist/ + dependências de produção ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    TZ=America/Recife \
    DATA_DIR=/app/data \
    WORK_DIR=/app/work \
    OUTPUT_DIR=/app/output
# Fontes para o texto dos gráficos (librsvg/sharp precisa de fontes instaladas).
RUN apt-get update \
 && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY mock/data ./mock/data
COPY templates ./templates
RUN mkdir -p data work output && chown -R node:node /app
USER node
CMD ["node", "dist/src/cli.js", "pipeline"]
