# Cabgo MCP Spec Shim

A tiny stdlib-only Node server (~140 LOC, zero dependencies) that
exists solely so MCP directory indexers (Glama servers flow,
`awesome-mcp-servers`' Glama-badge bot, etc.) can dockerize this
public repo and run an MCP introspection check.

**This is NOT the real Cabgo MCP.** The real server is hosted at:

- `https://www.cabgo.app/mcp` — full catalog (Claude Desktop, Cursor,
  custom DCR clients)
- `https://www.cabgo.app/mcp/operations` — OpenAI-safe catalog
  (ChatGPT Apps SDK — drops every `commerce`-tagged tool)

This shim handles:

| Method | Behavior |
|---|---|
| `initialize` | local response — declares the shim's identity + points at the hosted upstream |
| `tools/list` | forwards to `https://www.cabgo.app/mcp` and returns the live catalog |
| `notifications/*` | ACK (204) |
| `ping` | local pong |
| `tools/call` | rejects with JSON-RPC `-32601` and a message telling the caller to connect to the hosted URL |
| Anything else | `-32601 method not implemented` |

`GET /` returns an empty SSE stream (Streamable HTTP transport
handshake). `GET /healthz` returns `ok` for liveness probes.

The tool catalog is already public via `tools/list` on
`https://www.cabgo.app/mcp`, so forwarding introspection traffic
through this container reveals nothing that isn't already on the
internet. The shim deliberately rejects `tools/call` so nobody
mistakes this discovery server for the real one — every actual
invocation must go to the hosted endpoint, where OAuth, multi-tenant
isolation, and the actual business logic live.

## Local check

```bash
docker build -t cabgo-mcp-spec-shim .
docker run --rm -p 3333:3333 cabgo-mcp-spec-shim

# In another terminal:
curl -s -X POST http://localhost:3333/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq

curl -s -X POST http://localhost:3333/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq '.result.tools | length'
```

The second call should print a number around 130 (the live Cabgo
catalog) — that confirms the upstream forward is working.

## Why a shim and not the real MCP?

The real Cabgo MCP implementation lives in a private repo: it
depends on Prisma, OAuth client storage, payment infrastructure,
and tenant-scoped business logic that we don't open-source. The
**catalog** (tool names, input schemas, descriptions) IS public via
`tools/list` on the hosted endpoint, so making it dockerized-and-
indexable doesn't expose anything new.
