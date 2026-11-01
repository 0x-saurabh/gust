# Indexer + keeper image (one image, two services: docker-compose.yml and render.yaml).
FROM node:24-slim
WORKDIR /app
RUN npm init -y >/dev/null 2>&1 && npm install --omit=dev --no-audit --no-fund viem@2.57.13 >/dev/null
COPY indexer/src indexer/src
COPY indexer/abis indexer/abis
COPY keeper/src keeper/src
COPY contracts/deployments contracts/deployments
COPY src/lib/generated/deployments.json src/lib/generated/deployments.json
COPY ops/run-indexer.sh ops/run-keeper.sh ops/
ENV KYTE_REPO=/app NODE_ENV=production
# Runs as root on purpose: hosted persistent disks (Render) mount root-owned at indexer/data.
RUN mkdir -p indexer/data
CMD ["bash", "ops/run-indexer.sh"]
