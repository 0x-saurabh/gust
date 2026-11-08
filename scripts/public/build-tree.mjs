// Builds the public copy of one repo from an allowlist, in a clean folder, and refuses to continue if anything that
// must stay private slips through. Nothing is mirrored: only the paths listed here are copied.
//
//   node scripts/public/build-tree.mjs <contracts|staking|market> <outDir>
//
// Private (never copied): scripts/, ops/, video/, BUILD_PLAN.md, AGENTS.md, render.yaml, docker files, keeper/,
// docs/ (except the hook note), deployment archives, Safe files, mainnet fork tests, and every admin role address.
import fs from 'node:fs'
import path from 'node:path'

const [target, outDir] = process.argv.slice(2)
if (!['contracts', 'staking', 'market', 'profile', 'abis', 'docs'].includes(target) || !outDir) {
  console.error('usage: build-tree.mjs <contracts|staking|market|profile|abis|docs> <outDir>')
  process.exit(1)
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const dep = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/deployments/4663.json'), 'utf8'))

// Addresses the public never needs: governance and operator wallets. They are not in any public file or README.
const PRIVATE_KEYS = ['timelock', 'guardian', 'opsSafe', 'keeper', 'launch', 'legacyKyte']
const PRIVATE_ADDRESSES = [dep.timelock, dep.guardian, dep.opsSafe, dep.keeper, dep.legacyKyte?.kyteToken, dep.legacyKyte?.stakingPool, dep.legacyKyte?.buybackBurner, dep.legacyKyte?.swapAdapter].filter(Boolean)
const FORBIDDEN = [/saurabh/i, /dashboard\.render/i, /onrender\.com/i, /trig_[A-Za-z0-9]/, /\.kyte\/app/, /SAFE_OWNERS/, /Co-Authored-By/i, /BUILD_PLAN/, /GUST_REVERSE/, /SPEC\.md/, ...PRIVATE_ADDRESSES.map((a) => new RegExp(a, 'i'))]
// Comment citations of internal planning documents are reworded in the public copy; the code is untouched.
const REWRITE = [
  [/SPEC\.md §/g, 'spec §'],
  [/SPEC\.md/g, 'the protocol spec'],
  [/BUILD_PLAN\.md §5/g, 'the deployment notes'],
  [/BUILD_PLAN\.md \(Phase W3\)/g, 'the indexer notes'],
  [/BUILD_PLAN\.md/g, 'the build notes'],
  [/Render sets RENDER_EXTERNAL_URL/g, 'Some hosts set RENDER_EXTERNAL_URL'],
  [/Render: a pserv reachable\s*\n?\s*\* only on the internal network/g, 'a private service on the host\'s internal network'],
  [/\(Render: a pserv reachable only on the internal network\)/g, '(a private service on the internal network)'],
  [/servers, Render\b/g, 'servers'],
  [/\bRender\b(?= (then )?redeploys)/g, 'The host'],
  [/\(kyte-web\.onrender\.com\)/g, '(the host\'s default domain)'],
]

const scrubbed = (d) => { const o = { ...d }; for (const k of PRIVATE_KEYS) delete o[k]; return o }

// Listed markets, read from the AssetRegistry through the indexer (every token options can be written on today).
const ASSETS_URL = process.env.ASSETS_URL || 'http://localhost:4201/assets'
let assets = []
try {
  // enabled tokens only, minus the retired test token that is still listed on chain
  assets = (await (await fetch(ASSETS_URL)).json()).filter((a) => a.enabled && !PRIVATE_ADDRESSES.some((x) => x.toLowerCase() === a.address.toLowerCase()))
} catch (e) {
  console.error(`cannot read listed markets from ${ASSETS_URL}: ${e.message}`)
  process.exit(1)
}
const fmtCap = (a) => Number(BigInt(a.cap) / 10n ** BigInt(a.decimals)).toLocaleString('en-US')
const fmtStrike = (a) => `${Number(a.minStrike) / 1e18} ETH`
function marketsTable() {
  const x = (addr) => `[\`${addr}\`](https://robinhoodchain.blockscout.com/address/${addr})`
  const row = (a) => `| ${a.symbol} | ${a.name.replace(/ • Robinhood Token$/, '')} | ${x(a.address)} | ${a.putsEnabled ? 'calls, puts' : 'calls'} | ${fmtCap(a)} | ${fmtStrike(a)} |`
  const head = '| Symbol | Name | Contract | Options | Exposure cap | Min strike / token |\n|---|---|---|---|---|---|'
  const stocks = assets.filter((a) => / • Robinhood Token$/.test(a.name)).sort((p, q) => p.symbol.localeCompare(q.symbol))
  const others = assets.filter((a) => !/ • Robinhood Token$/.test(a.name)).sort((p, q) => p.symbol.localeCompare(q.symbol))
  return { stocks, others, head, row }
}
function marketsSection() {
  const { stocks, others, head, row } = marketsTable()
  return [
    `${assets.length} tokens are listed on the AssetRegistry and can be traded today: ${others.length} crypto and tokenized assets and ${stocks.length} Robinhood Stock Tokens. Every row is read from the registry on chain; the full list is also in [\`MARKETS.md\`](MARKETS.md).`,
    '',
    '### Crypto and tokenized assets',
    '',
    head, ...others.map(row),
    '',
    `<details><summary><strong>Robinhood Stock Tokens (${stocks.length})</strong></summary>`,
    '',
    head, ...stocks.map(row),
    '',
    '</details>',
  ].join('\n')
}
function marketsFile() {
  const { stocks, others, head, row } = marketsTable()
  return `# Listed markets on Kyte (Robinhood Chain, chain id 4663)\n\n${assets.length} tokens enabled on the AssetRegistry, read on chain at build time. Cap is the maximum open exposure per token; min strike is the lowest strike per token an offer may use.\n\n## Crypto and tokenized assets (${others.length})\n\n${head}\n${others.map(row).join('\n')}\n\n## Robinhood Stock Tokens (${stocks.length})\n\n${head}\n${stocks.map(row).join('\n')}\n`
}

// ---- allowlists (paths relative to the repo root; directories are copied whole, minus `skip`)
const CONTRACT_SKIP = ['contracts/test/ForkMarketsV3.t.sol', 'contracts/test/ForkRobinhoodStocks.t.sol', 'contracts/test/ForkPonsLister.t.sol', 'contracts/script/CreateSafes.s.sol', 'contracts/script/DeployKyteLaunch.s.sol']
const STAKING_TESTS = ['Base.t.sol', 'StakingPool.t.sol', 'BuybackBurner.t.sol', 'UniswapV4Adapter.t.sol', 'mocks/Mocks.sol', 'mocks/MockSwapAdapter.sol']
const PLAN = {
  contracts: {
    copy: ['contracts/src', 'contracts/test', 'contracts/script', 'contracts/foundry.toml', 'contracts/remappings.txt', 'contracts/package.json', 'contracts/pnpm-lock.yaml', 'docs/UNISWAP_V4_HOOK.md'],
    skip: CONTRACT_SKIP,
    flatten: 'contracts', // the public repo root is the contracts folder
    readme: 'README.contracts.md',
    ci: 'contracts',
  },
  staking: {
    copy: ['contracts/src', 'contracts/foundry.toml', 'contracts/remappings.txt', 'contracts/package.json', 'contracts/pnpm-lock.yaml', ...STAKING_TESTS.map((t) => `contracts/test/${t}`)],
    skip: [],
    flatten: 'contracts',
    readme: 'README.staking.md',
    ci: 'contracts',
  },
  market: {
    copy: ['src', 'public', 'indexer', 'package.json', 'pnpm-lock.yaml', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs'],
    skip: ['src/lib/generated/deployments.json'],
    flatten: '',
    readme: 'README.market.md',
    ci: 'web',
  },
  profile: { copy: [], skip: [], flatten: '', readme: 'README.profile.md', ci: null },
  abis: { copy: [], skip: [], flatten: '', readme: 'README.abis.md', ci: null },
  docs: { copy: [], skip: [], flatten: '', readme: null, ci: null },
}[target]
const CODE = ['contracts', 'staking', 'market'].includes(target)

// ---- copy
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
const dest = (rel) => path.join(outDir, PLAN.flatten && rel.startsWith(PLAN.flatten + '/') ? rel.slice(PLAN.flatten.length + 1) : rel)
function copy(rel) {
  const src = path.join(ROOT, rel)
  if (!fs.existsSync(src)) { console.error(`missing ${rel}`); process.exit(1) }
  if (fs.statSync(src).isDirectory()) {
    for (const f of fs.readdirSync(src)) {
      const child = `${rel}/${f}`
      if (f === 'node_modules' || f === 'out' || f === 'cache' || f === 'broadcast' || f === 'data' || f === '.DS_Store') continue
      if (PLAN.skip.includes(child)) continue
      copy(child)
    }
    return
  }
  if (PLAN.skip.includes(rel)) return
  fs.mkdirSync(path.dirname(dest(rel)), { recursive: true })
  if (/\.(sol|ts|tsx|mjs|js|md|json|yml|yaml|toml|txt)$/.test(rel)) {
    let text = fs.readFileSync(src, 'utf8')
    for (const [re, to] of REWRITE) text = text.replace(re, to)
    fs.writeFileSync(dest(rel), text)
  } else {
    fs.copyFileSync(src, dest(rel))
  }
}
for (const p of PLAN.copy) copy(p)

// ---- generated files: scrubbed deployment config, README, CONTRACTS.md, CI, env example
const pub = scrubbed(dep)
const ABI_CONTRACTS = ['AssetRegistry', 'CallMarket', 'PutMarket', 'OptionNFT', 'Router', 'FeeVault', 'StakingPool', 'BuybackBurner', 'UniswapV4Adapter', 'KyteHook']
if (target === 'abis') {
  fs.mkdirSync(path.join(outDir, 'abis'), { recursive: true })
  const names = []
  for (const n of ABI_CONTRACTS) {
    const art = path.join(ROOT, `contracts/out/${n}.sol/${n}.json`)
    if (!fs.existsSync(art)) { console.error(`missing artifact ${art}: run forge build in contracts/`); process.exit(1) }
    fs.writeFileSync(path.join(outDir, `abis/${n}.json`), JSON.stringify(JSON.parse(fs.readFileSync(art, 'utf8')).abi, null, 2) + '\n')
    names.push(n)
  }
  fs.writeFileSync(path.join(outDir, 'addresses.json'), JSON.stringify({ 4663: pub }, null, 2) + '\n')
  fs.writeFileSync(path.join(outDir, 'index.mjs'), `${names.map((n) => `import ${n} from './abis/${n}.json' with { type: 'json' }`).join('\n')}
import all from './addresses.json' with { type: 'json' }

export const chainId = 4663
export const abis = { ${names.join(', ')} }
export const addresses = all[chainId]
export default { chainId, abis, addresses }
`)
  fs.writeFileSync(path.join(outDir, 'index.d.ts'), `import type { Abi } from 'viem'
${names.map((n) => `import ${n} from './abis/${n}.json'`).join('\n')}
export declare const chainId: 4663
export declare const abis: { ${names.map((n) => `${n}: typeof ${n} & Abi`).join('; ')} }
export declare const addresses: typeof import('./addresses.json')['4663']
declare const _default: { chainId: typeof chainId; abis: typeof abis; addresses: typeof addresses }
export default _default
`)
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ name: 'kyte-abis', version: '1.0.0', description: 'ABIs, addresses and types for the Kyte options market on Robinhood Chain', license: 'MIT', type: 'module', main: './index.mjs', types: './index.d.ts', exports: { '.': { types: './index.d.ts', import: './index.mjs' }, './addresses.json': './addresses.json', './abis/*': './abis/*' }, files: ['abis', 'addresses.json', 'index.mjs', 'index.d.ts'], peerDependencies: { viem: '>=2' }, peerDependenciesMeta: { viem: { optional: true } }, repository: 'github:usekyte-org/kyte-abis', homepage: 'https://kyte.sh' }, null, 2) + '\n')
  fs.writeFileSync(path.join(outDir, '.gitignore'), 'node_modules\n.DS_Store\n')
}
if (target === 'profile') fs.copyFileSync(path.join(ROOT, 'scripts/public/assets/banner.png'), path.join(outDir, 'banner.png'))
if (target === 'docs') {
  const src = path.join(ROOT, 'scripts/public/docs')
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(outDir, f))
  fs.writeFileSync(path.join(outDir, 'contracts.md'), `# Contracts\n\nAll addresses are on Robinhood Chain (chain id 4663). Sources: [usekyte-org/kyte-contract-v2](https://github.com/usekyte-org/kyte-contract-v2). ABIs and types: [usekyte-org/kyte-abis](https://github.com/usekyte-org/kyte-abis).\n\n${contractsTable()}\n\n## Listed markets\n\n${marketsSection()}\n`)
}
if (target === 'market') {
  const gen = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/generated/deployments.json'), 'utf8'))
  const out = {}
  for (const [chain, cfg] of Object.entries(gen)) if (chain === '4663') out[chain] = scrubbed(cfg)
  fs.mkdirSync(path.join(outDir, 'src/lib/generated'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'src/lib/generated/deployments.json'), JSON.stringify(out, null, 2) + '\n')
  fs.mkdirSync(path.join(outDir, 'contracts/deployments'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'contracts/deployments/4663.json'), JSON.stringify(pub, null, 2) + '\n')
  // .env.example without the Privy app id: each deployment registers its own
  const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8').replace(/^NEXT_PUBLIC_PRIVY_APP_ID=.*$/m, 'NEXT_PUBLIC_PRIVY_APP_ID=')
  fs.writeFileSync(path.join(outDir, '.env.example'), env)
} else if (target === 'contracts' || target === 'staking') {
  fs.mkdirSync(path.join(outDir, 'deployments'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'deployments/4663.json'), JSON.stringify(pub, null, 2) + '\n')
}
const tpl = (f) => fs.readFileSync(path.join(ROOT, 'scripts/public', f), 'utf8')
if (CODE) {
  // package.json: public name, and only the scripts that work in the public tree
  const PKG_NAME = { contracts: 'kyte-contracts', staking: 'kyte-staking-pool', market: 'kyte-market' }[target]
  const pkgPath = path.join(outDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.name = PKG_NAME
  if (target === 'market') pkg.scripts = Object.fromEntries(Object.entries(pkg.scripts).filter(([k]) => ['dev', 'build', 'start', 'typecheck', 'indexer'].includes(k)))
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  // ignore files written fresh: nothing about the private tree's layout
  fs.writeFileSync(path.join(outDir, '.gitignore'), target === 'market' ? 'node_modules\n.next\n.env\n.env.local\n*.tsbuildinfo\nnext-env.d.ts\nindexer/data\n.DS_Store\n' : 'node_modules\nout\ncache\nbroadcast\n.env\n.DS_Store\n')
  if (target === 'market') fs.writeFileSync(path.join(outDir, '.dockerignore'), 'node_modules\n.next\n.git\n.env\n.env.local\nindexer/data\n')
  fs.writeFileSync(path.join(outDir, 'MARKETS.md'), marketsFile())
  fs.mkdirSync(path.join(outDir, '.github/workflows'), { recursive: true })
  fs.writeFileSync(path.join(outDir, '.github/workflows/ci.yml'), tpl(`ci.${PLAN.ci}.yml`))
}
if (PLAN.readme) {
  fs.writeFileSync(path.join(outDir, 'README.md'), tpl(PLAN.readme)
    .replaceAll('{{CONTRACTS}}', contractsTable()).replaceAll('{{MARKETS}}', marketsSection())
    .replaceAll('{{MARKET_COUNT}}', String(assets.length)).replaceAll('{{KYTE}}', pub.kyteToken).replaceAll('{{KYTE_LC}}', pub.kyteToken.toLowerCase()))
}
if (CODE || target === 'abis') fs.writeFileSync(path.join(outDir, 'CONTRACTS.md'), `# Kyte contracts on Robinhood Chain (chain id 4663)\n\nEvery address below is verified on Sourcify and readable on Blockscout.\n\n${contractsTable()}\n`)
if (target !== 'profile') {
  fs.writeFileSync(path.join(outDir, 'LICENSE'), tpl('LICENSE'))
  fs.writeFileSync(path.join(outDir, 'SECURITY.md'), tpl('SECURITY.md'))
  fs.mkdirSync(path.join(outDir, '.github/ISSUE_TEMPLATE'), { recursive: true })
  fs.writeFileSync(path.join(outDir, '.github/ISSUE_TEMPLATE/bug_report.md'), tpl('bug_report.md'))
}

function contractsTable() {
  const x = (a) => `[\`${a}\`](https://robinhoodchain.blockscout.com/address/${a})`
  const rows = [
    ['$KYTE token', pub.kyteToken],
    ['StakingPool', pub.stakingPool],
    ['BuybackBurner', pub.buybackBurner],
    ['FeeVault', pub.feeVault],
    ['Uniswap v4 swap adapter', pub.swapAdapter],
    ['KyteHook (Uniswap v4)', pub.kyteHook],
    ['AssetRegistry (markets v2/v3)', pub.v3?.assetRegistry || pub.v2?.assetRegistry],
    ['CallMarket (v3)', pub.v3?.callMarket],
    ['PutMarket (v3)', pub.v3?.putMarket],
    ['Router (v3)', pub.v3?.router],
    ['OptionNFT (v3)', pub.v3?.optionNft],
    ['WETH', pub.weth],
    ['Uniswap v4 PoolManager', pub.uniswapV4PoolManager],
  ].filter(([, a]) => a)
  return `| Contract | Address |\n|---|---|\n${rows.map(([n, a]) => `| ${n} | ${x(a)} |`).join('\n')}`
}

// ---- gate: nothing private in the output tree
const bad = []
function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) { scan(p); continue }
    if (/\.(png|jpg|jpeg|wav|mp4|ico|woff2?)$/i.test(f)) continue
    const text = fs.readFileSync(p, 'utf8')
    for (const re of FORBIDDEN) if (re.test(text)) bad.push(`${path.relative(outDir, p)}: ${re}`)
  }
}
scan(outDir)
if (bad.length) {
  console.error('REFUSING TO PUBLISH, private material in the public tree:\n  ' + bad.join('\n  '))
  process.exit(2)
}
console.log(`${target}: ${countFiles(outDir)} files in ${outDir}, no private material found`)
function countFiles(d) { let n = 0; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); n += fs.statSync(p).isDirectory() ? countFiles(p) : 1 } return n }
