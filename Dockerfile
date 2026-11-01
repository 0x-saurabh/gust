# One Dockerfile, two images:
#   docker build --target web .        Next.js site (standalone server)
#   docker build --target services .   indexer + keeper (same image, different command)
# docker-compose.yml builds both; see docker/README.md.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG FOUNDRY_IMAGE=ghcr.io/foundry-rs/foundry:v1.8.3

# ------------------------------------------------------------ contract ABIs (forge)
# The indexer and keeper read ABIs from contracts/out, which is build output and not in git.
FROM ${FOUNDRY_IMAGE} AS foundry

FROM ${NODE_IMAGE} AS contracts
RUN corepack enable && corepack prepare pnpm@10 --activate \
 && apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
WORKDIR /app/contracts
COPY contracts/package.json contracts/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY contracts/ ./
# Only what the services load: our contracts, the mocks (ERC20/WETH ABIs) and Uniswap's PoolManager.
RUN forge build src test/mocks/Mocks.sol node_modules/@uniswap/v4-core/src/PoolManager.sol

# ------------------------------------------------------------ web
FROM ${NODE_IMAGE} AS web-deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM web-deps AS web-build
# NEXT_PUBLIC_* values are inlined into the browser bundle (and the CSP) at build time,
# so changing one means rebuilding the web image.
ARG NEXT_PUBLIC_CHAIN_ID=4663
ARG NEXT_PUBLIC_RPC_URL=
ARG NEXT_PUBLIC_DEMO=0
ARG NEXT_PUBLIC_INDEXER_URL=
ARG NEXT_PUBLIC_PRIVY_APP_ID=
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_DEMO=$NEXT_PUBLIC_DEMO \
    NEXT_PUBLIC_INDEXER_URL=$NEXT_PUBLIC_INDEXER_URL \
    NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm build

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3010 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build --chown=node:node /app/.next/standalone ./
COPY --from=web-build --chown=node:node /app/.next/static ./.next/static
COPY --from=web-build --chown=node:node /app/public ./public
USER node
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ------------------------------------------------------------ indexer + keeper
FROM ${NODE_IMAGE} AS services-deps
WORKDIR /app
# The services only import viem; pin the site's exact version instead of installing the whole web stack.
RUN printf '{"name":"kyte-services","private":true,"type":"module","dependencies":{"viem":"2.57.13"}}' > package.json \
 && npm install --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS services
ENV NODE_ENV=production NODE_NO_WARNINGS=1
WORKDIR /app
COPY --from=services-deps /app/node_modules ./node_modules
COPY --from=services-deps /app/package.json ./package.json
COPY --from=contracts /app/contracts/out ./contracts/out
COPY contracts/deployments ./contracts/deployments
COPY indexer/src ./indexer/src
COPY keeper/src ./keeper/src
RUN mkdir -p indexer/data && chown node:node indexer/data
USER node
VOLUME ["/app/indexer/data"]
EXPOSE 4200
CMD ["node", "indexer/src/index.mjs"]
