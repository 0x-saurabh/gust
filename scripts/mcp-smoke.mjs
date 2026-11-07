// Smoke test for the Kyte MCP endpoint with the official client: list tools, call two, read a resource, get a prompt.
//   node scripts/mcp-smoke.mjs [http://localhost:3010/api/mcp]
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = new URL(process.argv[2] || 'http://localhost:3010/api/mcp')
const client = new Client({ name: 'kyte-smoke', version: '0.0.0' })
await client.connect(new StreamableHTTPClientTransport(url))

const tools = await client.listTools()
console.log('tools:', tools.tools.length, tools.tools.map((t) => `${t.name}${t.annotations?.readOnlyHint ? '' : '*'}`).join(' '))
const stake = await client.callTool({ name: 'get_staking', arguments: {} })
console.log('get_staking:', String(stake.content[0].text).slice(0, 140))
const tokens = await client.callTool({ name: 'list_tokens', arguments: { query: 'kyte' } })
console.log('list_tokens:', String(tokens.content[0].text).slice(0, 140))
const bad = await client.callTool({ name: 'prepare_cash_secured_put', arguments: { token: 'KYTE', amount: 1, strikePerToken: 0.001, premium: 0.001 } })
console.log('prepare_cash_secured_put KYTE:', String(bad.content[0].text).slice(0, 140))
const res = await client.listResources()
console.log('resources:', res.resources.map((r) => r.uri).join(' '))
const doc = await client.readResource({ uri: 'kyte://docs/fees' })
console.log('docs/fees:', String(doc.contents[0].text).split('\n')[0])
const prompts = await client.listPrompts()
console.log('prompts:', prompts.prompts.map((p) => p.name).join(' '))
const p = await client.getPrompt({ name: 'find_best_offers', arguments: { token: 'PONS' } })
console.log('prompt text:', p.messages[0].content.text.slice(0, 80))
await client.close()
console.log('ok')
