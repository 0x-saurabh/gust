# Indexer + keeper image (one image, two services in docker-compose.yml).
FROM node:24-slim
WORKDIR /app
RUN npm init -y >/dev/null 2>&1 && npm install --omit=dev --no-audit --no-fund viem@2.57.13 >/dev/null
COPY indexer/src indexer/src
COPY keeper/src keeper/src
COPY contracts/deployments contracts/deployments
COPY src/lib/generated/deployments.json src/lib/generated/deployments.json
# only the ABIs the services read (contracts/out is 11 MB; these are a few hundred KB)
COPY contracts/out/AssetRegistry.sol contracts/out/AssetRegistry.sol
COPY contracts/out/BuybackBurner.sol contracts/out/BuybackBurner.sol
COPY contracts/out/CallMarket.sol contracts/out/CallMarket.sol
COPY contracts/out/FeeVault.sol contracts/out/FeeVault.sol
COPY contracts/out/Mocks.sol contracts/out/Mocks.sol
COPY contracts/out/OptionNFT.sol contracts/out/OptionNFT.sol
COPY contracts/out/PoolManager.sol contracts/out/PoolManager.sol
COPY contracts/out/PutMarket.sol contracts/out/PutMarket.sol
COPY contracts/out/StakingPool.sol contracts/out/StakingPool.sol
COPY contracts/out/UniswapV4Adapter.sol contracts/out/UniswapV4Adapter.sol
COPY ops/run-indexer.sh ops/run-keeper.sh ops/
ENV KYTE_REPO=/app NODE_ENV=production
RUN mkdir -p indexer/data && chown -R node:node /app
USER node
CMD ["bash", "ops/run-indexer.sh"]
