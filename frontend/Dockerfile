FROM node:20-alpine AS base

WORKDIR /app

ARG PNPM_VERSION=10.30.1
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_registry=${NPM_REGISTRY} \
    npm_config_fetch_retries=6 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_network_concurrency=8

# Prepare pnpm once in the shared base image so builder/runner stages do not
# trigger an extra Corepack download during `pnpm build` / `pnpm start`.
RUN corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN /bin/sh -c 'attempt=1; max=4; while [ "$attempt" -le "$max" ]; do \
      echo "pnpm install attempt ${attempt}/${max}"; \
      pnpm install --frozen-lockfile --prefer-offline --reporter=append-only --network-concurrency=8 && exit 0; \
      if [ "$attempt" -eq "$max" ]; then break; fi; \
      sleep_for=$((attempt * 20)); \
      echo "pnpm install failed, retrying in ${sleep_for}s..." >&2; \
      sleep "$sleep_for"; \
      attempt=$((attempt + 1)); \
    done; \
    exit 1'

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN pnpm build

FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY --from=builder /app .

EXPOSE 3000

CMD ["pnpm", "start", "--hostname", "0.0.0.0", "--port", "3000"]
