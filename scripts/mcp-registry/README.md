# Official MCP Registry listing

`server.json` is Kyte's entry in the official MCP Registry (registry.modelcontextprotocol.io), published under the
domain namespace `sh.kyte/*`. Ownership is proved over HTTP: `public/.well-known/mcp-registry-auth` holds the public
half of an Ed25519 key; the private half lives outside the repo at `~/.kyte/mcp-registry-key.pem` (keep it, it is
needed for every republish).

Publish or update (bump `version` first):

```bash
KEY_HEX=$(/opt/homebrew/opt/openssl@3/bin/openssl pkey -in ~/.kyte/mcp-registry-key.pem -outform DER | tail -c 32 | xxd -p -c 64)
mcp-publisher login http --domain kyte.sh --private-key "$KEY_HEX"
mcp-publisher publish scripts/mcp-registry/server.json
```

Glama, PulseMCP and the GitHub MCP Registry import from the official registry, so one publish covers them.
