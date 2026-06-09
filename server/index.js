#!/usr/bin/env node
// Cabgo MCP spec-shim
//
// Tiny stdlib-only Node server that exists ONLY so directory indexers
// (Glama servers flow, awesome-mcp-servers' Glama-badge bot, etc.) can
// dockerize this public repo and run an MCP introspection check
// against it.
//
// What it does:
//   - POST /  (Streamable HTTP JSON-RPC transport, spec 2025-06-18)
//       * initialize / initialized   → handled locally, no upstream call
//       * tools/list                  → forwards to UPSTREAM, returns
//                                       the live Cabgo catalog
//       * notifications/*             → 204 ACK
//       * everything else (tools/call, prompts/*, resources/*) →
//         returns JSON-RPC error -32601 with a message pointing the
//         caller at UPSTREAM for real execution
//   - GET /  → empty SSE stream (transport-required handshake)
//   - GET /healthz  → "ok"  (Glama liveness probe)
//
// Why a shim and not the real MCP: the real Cabgo MCP lives at
// https://www.cabgo.app/mcp (and /mcp/operations for the OpenAI
// Apps SDK surface). Its implementation depends on Prisma, OAuth,
// payment infra, and tenant-scoped business logic that we keep
// private. The CATALOG (tool names, input schemas, descriptions)
// is already public via `tools/list` on that hosted endpoint — so
// forwarding introspection traffic here reveals nothing new.
//
// To actually invoke tools, connect a real MCP client (ChatGPT
// Developer Mode, Claude Desktop, Cursor, etc.) to the hosted URL.
// This shim deliberately rejects tools/call so nobody mistakes
// the discovery server for the real one.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3333);
const UPSTREAM = (
  process.env.CABGO_UPSTREAM_MCP_URL ?? "https://www.cabgo.app/mcp"
).trim();
const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "cabgo-mcp-spec-shim",
  version: "1.0.0",
  title: "Cabgo (spec-only shim)",
};

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message, data) => ({
  jsonrpc: "2.0",
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

async function forwardToUpstream(rpc) {
  const res = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    },
    body: JSON.stringify(rpc),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return rpcError(
      rpc.id,
      -32603,
      `upstream returned non-JSON (HTTP ${res.status})`,
      text.slice(0, 200),
    );
  }
}

async function dispatch(rpc) {
  const { id, method } = rpc;

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "This is a spec-only discovery shim. Tool definitions are " +
        "served from " +
        UPSTREAM +
        " via tools/list. To actually invoke Cabgo tools (create app, " +
        "list trips, approve drivers, etc.) connect your MCP client " +
        "directly to " +
        UPSTREAM +
        ".",
    });
  }

  if (method === "notifications/initialized" || method?.startsWith("notifications/")) {
    return null;
  }

  if (method === "tools/list") {
    return forwardToUpstream(rpc);
  }

  if (method === "tools/call") {
    return rpcError(
      id,
      -32601,
      "tools/call is not supported on this spec-only shim. " +
        "Connect your MCP client to " +
        UPSTREAM +
        " to invoke tools.",
    );
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  return rpcError(id, -32601, `method '${method}' not implemented on the spec shim`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.end(": cabgo-mcp-spec-shim\n\n");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const raw = await readBody(req);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(rpcError(null, -32700, "parse error: body is not valid JSON")),
    );
    return;
  }

  const requests = Array.isArray(parsed) ? parsed : [parsed];
  const responses = [];
  for (const rpc of requests) {
    const out = await dispatch(rpc);
    if (out !== null) responses.push(out);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  if (responses.length === 0) {
    res.end();
    return;
  }
  res.end(JSON.stringify(Array.isArray(parsed) ? responses : responses[0]));
});

server.listen(PORT, () => {
  console.log(
    `[cabgo-mcp-spec-shim] listening on :${PORT}; upstream=${UPSTREAM}`,
  );
});
