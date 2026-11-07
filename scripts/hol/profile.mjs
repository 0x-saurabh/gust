// Builds the HCS-11 MCP server profile for Kyte from the live tool catalogue, for the HOL Registry Broker.
// Usage: node profile.mjs [mcpUrlToRead]   (default http://localhost:3010/api/mcp; the profile always points at https://kyte.sh/api/mcp)
import fs from 'node:fs'
import path from 'node:path'

const PUBLIC_URL = 'https://kyte.sh/api/mcp'
const READ_FROM = process.argv[2] || 'http://localhost:3010/api/mcp'
const HEDERA_ACCOUNT = process.env.HEDERA_ACCOUNT_ID || '' // ownership proof: TXT record _hedera.kyte.sh = this account id

async function rpc(method) {
  const r = await fetch(READ_FROM, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }) })
  const text = await r.text()
  const line = text.split('\n').find((l) => l.startsWith('data:')) // SSE framing, or plain JSON
  return JSON.parse(line ? line.slice(5) : text).result
}

const tools = (await rpc('tools/list')).tools.map((t) => ({ name: t.name, description: String(t.description).slice(0, 240) }))
const resources = (await rpc('resources/list')).resources.map((r) => ({ name: r.name, description: String(r.description ?? r.title ?? '').slice(0, 240) }))

// HCS-11 enums (standards-sdk): ProfileType.MCP_SERVER = 2; MCPServerCapability TOOL_PROVIDER 1, RESOURCE_PROVIDER 0, PROMPT_TEMPLATE_PROVIDER 2, API_INTEGRATION 5
const profile = {
  version: '1.0.0',
  type: 2,
  display_name: 'Kyte',
  alias: 'kyte',
  bio: 'Non-custodial, fully collateralised options market on Robinhood Chain. Read live markets, offers, prices, positions, staking and fee proof; prepare trades that the user reviews and signs in their own wallet. The server never holds keys or sends transactions.',
  socials: [
    { platform: 'website', handle: 'kyte.sh' },
    { platform: 'x', handle: 'useKyte' },
    { platform: 'github', handle: 'usekyte' },
  ],
  profileImage: 'https://kyte.sh/icon.png',
  mcpServer: {
    version: '1.0.0',
    // Streamable HTTP (MCP 2025-03-26). HCS-11 only knows 'stdio' | 'sse'; 'sse' is the remote-HTTP value.
    connectionInfo: { url: PUBLIC_URL, transport: 'sse' },
    services: [1, 0, 2, 5],
    description: 'Kyte options market: 12 read tools (markets, offers, prices, charts, positions, staking, protocol stats, fee proof, activity, explain and compare offers) and 5 prepare tools that return a kyte.sh link for the user to review and sign. Read-only on chain; nothing is executed by the server.',
    ...(HEDERA_ACCOUNT ? { verification: { type: 'dns', value: 'kyte.sh', dns_field: 'hedera' } } : {}),
    capabilities: ['options', 'defi', 'market-data', 'robinhood-chain', 'non-custodial', 'read-only', 'prepare-and-sign'],
    tools,
    resources,
    maintainer: 'Kyte <contact@kyte.sh>',
    repository: 'https://github.com/usekyte',
    docs: 'https://kyte.sh/mcp',
  },
}

const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'kyte-profile.json')
fs.writeFileSync(out, JSON.stringify(profile, null, 2) + '\n')
console.log(`profile written: ${out}\n${tools.length} tools, ${resources.length} resources, url ${PUBLIC_URL}${HEDERA_ACCOUNT ? '' : '\n(no HEDERA_ACCOUNT_ID set: verification block omitted; add the _hedera TXT record and set it to include dns verification)'}`)
