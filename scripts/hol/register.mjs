// Registers Kyte's MCP server with the HOL Registry Broker (https://hol.org/registry).
//   node register.mjs --quote      prints the credit quote, changes nothing
//   node register.mjs --register   registers, polls to completion, prints the UAID and records it in docs/HOL_REGISTRY.md
// Env (never committed): REGISTRY_BROKER_API_KEY from the HOL billing portal; HEDERA_NETWORK, HEDERA_ACCOUNT_ID,
// HEDERA_PRIVATE_KEY if the broker asks for ledger auth on your account. Run `pnpm install` in this folder first.
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const mode = process.argv.includes('--register') ? 'register' : 'quote'
const profilePath = path.join(here, 'kyte-profile.json')
if (!fs.existsSync(profilePath)) { console.error('run `node profile.mjs` first'); process.exit(1) }
if (!process.env.REGISTRY_BROKER_API_KEY) { console.error('REGISTRY_BROKER_API_KEY is not set (hol.org/registry, billing portal)'); process.exit(1) }

const { RegistryBrokerClient } = await import('@hashgraphonline/standards-sdk')
const client = new RegistryBrokerClient({ apiKey: process.env.REGISTRY_BROKER_API_KEY, baseUrl: 'https://hol.org/registry/api/v1' })
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))

const payload = {
  profile,
  registry: 'hashgraph-online',
  communicationProtocol: 'mcp',
  // endpoint omitted on purpose: for MCP the broker routes to profile.mcpServer.connectionInfo.url
  metadata: { provider: 'kyte', category: 'defi', chain: 'robinhood-chain', chainId: 4663, readOnly: true, custody: 'none' },
}

const quote = await client.getRegistrationQuote(payload)
console.log('quote:', JSON.stringify({ requiredCredits: quote.requiredCredits, shortfallCredits: quote.shortfallCredits, baseCredits: quote.baseCredits, additionalCredits: quote.additionalCredits }))
if (mode === 'quote') { console.log('quote only; nothing registered'); process.exit(0) }
if (Number(quote.shortfallCredits) > 0) { console.error(`short ${quote.shortfallCredits} credits: top up at https://hol.org/registry/billing and run again`); process.exit(2) }

const res = await client.registerAgent(payload)
let uaid = res?.registration?.uaid
let status = res?.status
if (!uaid && res?.attemptId) {
  console.log(`attempt ${res.attemptId}: ${status}, polling…`)
  const fin = await client.waitForRegistrationCompletion(res.attemptId, { intervalMs: 2000, timeoutMs: 5 * 60 * 1000, onProgress: (p) => console.log(' ', p?.status ?? p) })
  uaid = fin?.uaid ?? fin?.registration?.uaid; status = fin?.status
}
if (!uaid) { console.error('no UAID returned:', JSON.stringify(res).slice(0, 800)); process.exit(3) }
const resolved = await client.resolveUaid(uaid).catch(() => null)
console.log(`registered: ${uaid} (${status})${resolved?.agent?.profile?.display_name ? `, resolves as ${resolved.agent.profile.display_name}` : ''}`)

const rec = path.resolve(here, '../../docs/HOL_REGISTRY.md')
const line = `\n| ${new Date().toISOString().slice(0, 10)} | ${uaid} | ${status} | ${profile.mcpServer.connectionInfo.url} | ${profile.mcpServer.tools.length} tools |\n`
fs.appendFileSync(rec, line)
console.log(`recorded in ${rec}`)
