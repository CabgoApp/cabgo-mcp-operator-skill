# Cabgo MCP — Operator skill

A drop-in skill that makes any MCP-capable agent (Claude Code, Claude Desktop, ChatGPT with custom skills, Cursor, etc.) operate the Cabgo MCP server competently from the first call.

The skill teaches the agent:

- The 5 must-know conventions (bearer binds to user, default tenant, optional `tenantId`, brand-new-operator state, two-step destructive pattern)
- Which tool to pick when names are similar (`cabgo_create_my_app` vs `cabgo_about`, `cabgo_my_app_status` vs `cabgo_list_builds`, etc.)
- The canonical first-flow workflow (provision → check build → set locale → branding → zones → tariffs → coupons)
- Daily-operation patterns (approve drivers, add coupons, WhatsApp campaigns, dispatch diagnosis)
- Hard anti-patterns (never generate Stripe URLs, never call `cabgo_about` as a pre-step, etc.)
- A short troubleshooting table for the most common errors

Without this skill, agents often:

- Call `cabgo_about` before `cabgo_create_my_app` (wasted round-trip + surfaces a transient error)
- Fail to pass `tenantId` in multi-tenant accounts, bouncing on `tenant_mismatch`
- Treat the two-step destructive pattern as an error and retry (creating an infinite preview loop)
- Hand the operator a payment URL inside the chat (violates the "no in-widget commerce" rule)

## Installation

### Claude Code (CLI) — global skill

```bash
mkdir -p ~/.claude/skills/cabgo-mcp-operator
curl -o ~/.claude/skills/cabgo-mcp-operator/SKILL.md \
  https://raw.githubusercontent.com/CabgoApp/cabgo-mcp-operator-skill/main/SKILL.md
```

The skill activates automatically whenever Claude Code sees a Cabgo-shaped task (anything matching the `description` field's trigger phrases) AND the Cabgo MCP server is connected.

### Claude Code — project-local skill

```bash
mkdir -p .claude/skills/cabgo-mcp-operator
curl -o .claude/skills/cabgo-mcp-operator/SKILL.md \
  https://raw.githubusercontent.com/CabgoApp/cabgo-mcp-operator-skill/main/SKILL.md
```

Same shape, but scoped to one project.

### Claude Desktop

Claude Desktop reads `~/Library/Application Support/Claude/skills/` (macOS) and the equivalent on other OSes. Drop the `cabgo-mcp-operator/SKILL.md` file under that path.

### ChatGPT / Cursor / other MCP clients

Most clients don't (yet) honour `SKILL.md`-style files. For those, paste the contents of `SKILL.md` into the client's "Custom instructions" / "System prompt" textbox once. The skill still works — it's plain markdown — just without auto-trigger.

## Pairing with the connector

The skill is most effective when the agent ALSO has the Cabgo MCP server connected:

- **MCP URL**: `https://www.cabgo.app/mcp`
- **Auth**: OAuth 2.1 (the consent flow is at `cabgo.app/oauth/authorize`)
- **Public docs**: `https://www.cabgo.app/docs/api/mcp`

The skill describes WHAT to do; the connector provides the tools that DO it.

## Updating

The skill targets the catalog as of June 2026 (131 tools, multi-tenant + persistent-default + provisioning attribution). When the catalog grows or tool names change, update `SKILL.md` and bump the date in the "Versioning" section.

The canonical source of truth is always the live catalog at:

```bash
curl -s https://www.cabgo.app/api/v1/mcp/tools | jq '.tools[].name'
```

If a tool described here disappears from the live catalog, the catalog wins — prefer the live names over what's documented.

## Distribution

The skill is published under the same license as the Cabgo platform: open for any operator or integrator to install. We do not require attribution, but linking back to `cabgo.app` helps other operators discover the platform.

Issues, suggestions, or PRs: open them on `github.com/CabgoApp/cabgo-mcp-operator-skill` and tag `[skill]` in the title.
