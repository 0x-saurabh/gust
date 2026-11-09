# Security

## Scope

This repository holds Hermes Agent skills and an MCP config that point at the hosted Kyte MCP server,
`https://kyte.sh/api/mcp`. The server is read-only toward the chain: no tool can sign, send, spend, or read a key, and
every prepare tool returns a kyte.sh link the user signs in their own wallet. The skills contain no scripts and
declare no secrets.

## Reporting a vulnerability

Email **contact@kyte.sh** with the subject `security: hermes-kyte`. Include steps to reproduce and the impact. Please
do not open a public issue for a vulnerability.

We aim to acknowledge reports within 2 business days and to fix confirmed issues as fast as their severity requires.

## Out of scope

The Kyte smart contracts and the kyte.sh web app have their own repositories under
[github.com/usekyte-org](https://github.com/usekyte-org).
