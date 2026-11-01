// Copies the ABIs the indexer and keeper read from forge's out/ (gitignored) into indexer/abis/ (committed),
// so a server or Render build works without compiling the contracts.
//   node scripts/export-service-abis.mjs [path/to/contracts/out]
import fs from 'node:fs'
import path from 'node:path'

const out = process.argv[2] || 'contracts/out'
const dest = 'indexer/abis'
const NEEDED = [
  ['AssetRegistry.sol', 'AssetRegistry'], ['BuybackBurner.sol', 'BuybackBurner'], ['CallMarket.sol', 'CallMarket'],
  ['FeeVault.sol', 'FeeVault'], ['Mocks.sol', 'MockERC20'], ['OptionNFT.sol', 'OptionNFT'], ['PoolManager.sol', 'PoolManager'],
  ['PutMarket.sol', 'PutMarket'], ['StakingPool.sol', 'StakingPool'], ['UniswapV4Adapter.sol', 'UniswapV4Adapter'],
]
fs.mkdirSync(dest, { recursive: true })
for (const [file, name] of NEEDED) {
  const { abi } = JSON.parse(fs.readFileSync(path.join(out, file, `${name}.json`), 'utf8'))
  fs.writeFileSync(path.join(dest, `${name}.json`), JSON.stringify({ abi }) + '\n')
}
console.log(`${NEEDED.length} ABIs written to ${dest}/`)
