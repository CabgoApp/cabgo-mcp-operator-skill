---
name: cabgo-mcp-operator
description: Use when the user is operating a Cabgo tenant via the Cabgo MCP server (taxi, food delivery, gas distribution, courier — anything served by https://www.cabgo.app/mcp). Loads the conventions, multi-tenant routing rules, safety patterns, and tool-selection heuristics that make MCP calls land cleanly the first time instead of bouncing on tenant_mismatch, schema rejections, or destructive-action confirmations. Trigger on phrases like "create my [delivery / taxi / gas] app", "Cabgo", "Pidelo Express", "what tenants do I have", "create coupon WELCOME10", or any pattern the Cabgo MCP catalog would handle.
---

# Cabgo MCP — Operator skill

This skill makes a connected agent operate the Cabgo MCP server competently from the first call. Cabgo is a B2B SaaS that lets an operator (a business owner, not a consumer) launch and manage their own branded mobility / delivery / on-demand app from a single conversation.

The MCP server lives at **`https://www.cabgo.app/mcp`** and exposes ~130 tools. This file teaches the agent the **non-obvious conventions** so it doesn't have to learn them by trial and error.

## What Cabgo does (and what it does NOT do)

Cabgo provisions and operates full ride-hailing / delivery platforms:
- Branded rider + driver mobile apps (Android APK + iOS IPA)
- Dispatcher dashboard for trips, drivers, customers, orders
- Configurable service zones, tariffs, surcharges, multi-tenant
- Cash + card payments via Stripe / MercadoPago / dLocal
- WhatsApp / push notifications, multi-vertical (taxi / food delivery / gas / courier / services)

Cabgo **does NOT** facilitate payments inside the chat widget. All commerce happens externally on `cabgo.app` via Stripe Checkout. Tools never return Stripe URLs. Pricing info is informational only.

## The 5 things to know before calling any tool

### 1. The bearer binds to a USER, not to a tenant

The operator OAuth's once with Cabgo. That bearer can operate on every tenant the user owns / is a member of / resells. A single user routinely owns multiple tenants (a taxi app AND a delivery app, for example).

### 2. There is always a "default tenant" when the user has any

- First tenant the user creates via `cabgo_create_my_app` → automatically becomes the default
- Operator can change it later by calling `cabgo_set_default_tenant`
- Tenant-scoped tools called WITHOUT an explicit `tenantId` auto-resolve to the default
- `cabgo_list_my_tenants` returns an `isDefault` flag per row

### 3. `tenantId` is an optional arg on every dashboard tool

When the operator owns multiple tenants AND wants a specific one (not the default), pass `tenantId` as a normal tool argument. The MCP server forwards it as `X-Cabgo-Tenant`. **Accepts both the UUID id AND the slug** (`pidelo-express`, `taxi-express`).

Example:
```json
{
  "tenantId": "pidelo-express",
  "code": "WELCOME10",
  "discountType": "PERCENTAGE",
  "discountValue": 10
}
```

### 4. Brand-new operator (no tenants yet) is a real state

When the operator just connected and hasn't created any app, their token has `tenant_id=null` and `cabgo_list_my_tenants` returns `[]`. In this state, the ONLY callable tools are:

- `cabgo_about`, `cabgo_pricing`, `cabgo_install_instructions` (public)
- `cabgo_create_my_app`, `cabgo_create_trial`
- `cabgo_list_my_tenants`

Calling anything tenant-scoped returns `tenant_mismatch` with the message *"no tenant on token... Create your first tenant with cabgo_create_my_app"*. That's the cue to ask the operator what kind of business they want to launch.

### 5. Destructive tools use a two-step confirmation

Tools with `destructiveHint=true` (delete coupon, detach domain, adjust wallet, cancel trip, send WhatsApp broadcast, etc.) work in two steps:

1. **First call with `dryRun: true`** (the default) → server returns a preview + a `confirmationToken` (HMAC, 5-min TTL, bound to the exact payload hash)
2. **Second call with `dryRun: false` + the token** → server executes

If the operator changes ANY field between the two calls, the token is invalid and a new dryRun is required. Surface the preview to the operator BEFORE the second call — that's why the safety pattern exists.

## Tool selection — common confusions

These pairs trip up agents that pick by name alone. Always pick the one matching the user's actual intent:

| User's intent | RIGHT tool | WRONG tool (and why) |
|---|---|---|
| "I want to launch / create / build an app for my business" | `cabgo_create_my_app` | NOT `cabgo_about` — that's only for "what is Cabgo" type questions |
| "How do I connect / install / set up Cabgo on ChatGPT" | `cabgo_install_instructions` | NOT `cabgo_create_my_app` — they're asking for setup steps, not creating an app |
| "Pásame mi app / ¿ya está mi APK? / how's my build going" | `cabgo_my_app_status` | NOT `cabgo_list_builds` — list_builds is forensic exploration; my_app_status returns a pre-formatted summary |
| "What tenants do I have / show my apps" | `cabgo_list_my_tenants` | NOT `cabgo_about` |
| "How much does it cost / what are your plans" | `cabgo_pricing` | DO NOT generate any payment URL — info only |
| "Cambia mi país a Colombia / set me up for [country]" | `cabgo_update_locale` | NOT `cabgo_update_settings` — settings is for boolean feature flags |
| "Make Taxi Express my default" | `cabgo_set_default_tenant` | — |
| "Trial is running out, can I get more trips?" | Direct user to `cabgo.app/dashboard/plan` | DO NOT generate Stripe checkout links in chat |

## The canonical first-flow workflow

The flow a brand-new operator goes through, in order:

```
1. cabgo_create_my_app    → first tenant, becomes default
   ↓
2. cabgo_my_app_status    → "is my APK ready yet?"
   ↓
3. cabgo_update_locale    → if not in Mexico (default country=mx)
   ↓
4. cabgo_update_branding  → real brand colors / logo
   ↓
5. cabgo_create_zone      → first delivery / service zone
   ↓
6. cabgo_set_tariff       → pricing for the zone × service pair
   ↓
7. cabgo_create_coupon    → WELCOME10 promo, etc. (optional)
   ↓
8. (operator distributes the APK link from cabgo_my_app_status)
```

## Patterns by daily operation

### "How's my business doing?"

`cabgo_get_plan` (trip quota + lifecycle) + `cabgo_list_trips` (recent activity). Don't run heavy reports — the operator probably wants a one-paragraph summary, not a 200-row dump.

### "I need to add a coupon for X"

`cabgo_create_coupon` — auto-routes to default tenant. Always pass `discountType` ("PERCENTAGE" or "FIXED") + `discountValue`. For percent, value is the integer (10 means 10%). For fixed amounts, value is in the tenant's currency.

### "Approve / reject this driver"

`cabgo_list_pending_drivers` to find the id, then `cabgo_approve_driver` or `cabgo_reject_driver`. The operator may want to ask "show me their docs" first — use `cabgo_get_driver` for the full profile.

### "Send a WhatsApp campaign to my customers"

`cabgo_send_whatsapp_campaign` is destructive — the message reaches every opted-in customer and cannot be recalled. Always go through the dryRun preview, show the operator the count and a sample of the rendered text, then execute.

### "Why isn't dispatch finding drivers?"

`cabgo_get_dispatch_diagnosis` returns the live decision tree. Don't guess — feed it back to the operator verbatim with a one-line summary.

## Anti-patterns — never do these

- **Never** generate a Stripe Checkout URL or any payment session inside the chat. If the operator wants to upgrade, send them to `https://www.cabgo.app/dashboard/plan` (a plain link, not a CTA card).
- **Never** assume `tenantId` is the UUID — slugs work too and are friendlier (`pidelo-express` vs `771193fa-55ac-4adc-a1a0-d2bf8c2938c0`). Use whichever the operator gave you.
- **Never** call `cabgo_about` as a pre-step before `cabgo_create_my_app`. The model used to do this; it's wasted tokens at best and surfaces a transient error to the user at worst.
- **Never** retry a destructive tool after a confirmation card appears. The card IS the confirmation. Re-invoke ONLY after the operator approves via "Allow" / "Continue" / "Yes".
- **Never** silently mutate `User.companyId` (the persistent default). Use `cabgo_set_default_tenant` — it validates ownership.

## Troubleshooting common errors

| Error message | What it actually means | Fix |
|---|---|---|
| `tenant_mismatch: no tenant on token...` | Operator has 0 tenants OR multi-tenant ambiguity | Either create their first tenant or pass `tenantId` |
| `tenant_mismatch: user owns N: slug-a (id), slug-b (id). Pass tenantId...` | Operator has 2+ tenants and no default pinned | Ask which one, pass `tenantId` in next call |
| `insufficient_permission` | Token scope lacks the requested action | Operator needs to reconnect / re-OAuth with the right scopes |
| `tenant_suspended` | Tenant's trial expired without payment | Surface the activation URL exactly as returned — the operator pays externally |
| HTTP 409 on `cabgo_create_coupon` | Coupon code already exists | Suggest a different code or ask if they want to update the existing one |
| HTTP 402 on `cabgo_send_whatsapp_*` | Insufficient WhatsApp balance | Direct operator to recharge on `cabgo.app/dashboard/whatsapp` |

## Quick reference — where to look

- Full tool catalog (the source of truth, regenerated daily): `https://www.cabgo.app/api/v1/mcp/tools` or `tools/list` over JSON-RPC at the MCP endpoint
- Public product info (no auth): `https://www.cabgo.app/api/v1/onboarding/info`
- API docs (Scalar UI): `https://www.cabgo.app/api-docs`
- Status / supported countries: `cabgo_about` returns `realScale` (operators / countries / cities / published apps)

## Versioning

This skill targets the Cabgo MCP catalog as of June 2026 (131 tools, multi-tenant + persistent-default, attribution-tracking on tenant creation). If a tool name in the catalog has changed, prefer the catalog over this file — descriptions in the catalog are the source of truth.
