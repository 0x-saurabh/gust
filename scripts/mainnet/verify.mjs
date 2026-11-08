// Verifies every deployed contract on Sourcify (Blockscout imports from it). No key needed; safe to re-run.
//   node scripts/mainnet/verify.mjs         env: CHAIN_ID (4663), RPC_URL
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

const CHAIN_ID = process.env.CHAIN_ID || '4663'
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const FORGE = `${os.homedir()}/.foundry/bin/forge`
const CAST = `${os.homedir()}/.foundry/bin/cast`
const dep = JSON.parse(fs.readFileSync(`contracts/deployments/${CHAIN_ID}.json`, 'utf8'))
const ZERO = '0x0000000000000000000000000000000000000000'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function status(addr) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`https://sourcify.dev/server/v2/contract/${CHAIN_ID}/${addr}`)
      const d = await r.json()
      return d.match || null
    } catch { await sleep(2000) }
  }
  return null
}

// [deployment key, contract path, constructor args (only for factory-created contracts)]
const hookArgs = dep.kyteHook && dep.feeVault
  ? execFileSync(CAST, ['abi-encode', 'f(address,address,address,uint256,address)', dep.uniswapV4PoolManager, dep.timelock, dep.feeVault, '10', dep.weth]).toString().trim()
  : null
const targets = [
  ['timelock', 'node_modules/@openzeppelin/contracts/governance/TimelockController.sol:TimelockController'],
  ['assetRegistry', 'src/AssetRegistry.sol:AssetRegistry'],
  ['optionNft', 'src/OptionNFT.sol:OptionNFT'],
  ['feeVault', 'src/FeeVault.sol:FeeVault'],
  ['callMarket', 'src/CallMarket.sol:CallMarket'],
  ['putMarket', 'src/PutMarket.sol:PutMarket'],
  ['stakingPool', 'src/StakingPool.sol:StakingPool'],
  ['buybackBurner', 'src/BuybackBurner.sol:BuybackBurner'],
  ['router', 'src/Router.sol:Router'],
  ['kyteHook', 'src/hooks/KyteHook.sol:KyteHook', hookArgs],
  ['swapAdapter', 'src/adapters/UniswapV4Adapter.sol:UniswapV4Adapter'],
  ['ponsLister', 'src/PonsLister.sol:PonsLister'],
  ['harmonicHaltGate', 'src/KyteHaltGate.sol:KyteHaltGate'],
  // Markets v2 (DeployMarketsV2.s.sol)
  ['v2.assetRegistry', 'src/AssetRegistry.sol:AssetRegistry'],
  ['v2.optionNft', 'src/OptionNFT.sol:OptionNFT'],
  ['v2.callMarket', 'src/CallMarket.sol:CallMarket'],
  ['v2.putMarket', 'src/PutMarket.sol:PutMarket'],
  ['v2.router', 'src/Router.sol:Router'],
  // Markets v3 (DeployMarketsV3.s.sol): reuses the v2 AssetRegistry
  ['v3.optionNft', 'src/OptionNFT.sol:OptionNFT'],
  ['v3.callMarket', 'src/CallMarket.sol:CallMarket'],
  ['v3.putMarket', 'src/PutMarket.sol:PutMarket'],
  ['v3.router', 'src/Router.sol:Router'],
]

let failed = 0
for (const [key, path, args] of targets) {
  const addr = key.split('.').reduce((o, k) => o?.[k], dep)
  if (!addr || addr === ZERO) { console.log(`${key.padEnd(14)} skipped (not deployed)`); continue }
  let m = await status(addr)
  for (let i = 0; !m && i < 3; i++) {
    try {
      execFileSync(FORGE, ['verify-contract', addr, path, '--chain', CHAIN_ID, '--verifier', 'sourcify', '--rpc-url', RPC, ...(args ? ['--constructor-args', args] : [])], { cwd: 'contracts', stdio: 'pipe' })
    } catch {}
    await sleep(12000)
    m = await status(addr)
  }
  if (!m) failed++
  console.log(`${key.padEnd(14)} ${addr} ${m ?? 'NOT verified'}`)
}
console.log(failed ? `${failed} not verified yet: re-run this script` : 'all verified (Blockscout shows them via Sourcify)')
