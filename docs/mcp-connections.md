# MCP Connections

## Overview

Warpy can now connect to remote HTTP MCP servers without importing their tools into Features.

The model is intentionally split:

- API Config stores MCP connection records.
- The widget exchanges the current user session for short-lived MCP headers when needed.
- The backend agent runtime lists and calls MCP tools live during each run step.

Features remain the control plane only for manually configured Warpy tools.

## Saved connection fields

Each `mcp_connections` record stores:

- `name`
- `server_url`
- `auth_mode`: `none | static_headers | token_exchange`
- `static_headers`
- `token_exchange_path`

`static_headers` are dashboard-operator supplied and stored server-side.

Security: `static_headers` may contain sensitive credentials. Treat access to API Config and the underlying database as privileged operator access.

`token_exchange_path` is customer-owned and resolved relative to the same customer `baseUrl` already used for customer-owned browser requests.

## Runtime flow

```text
Widget -> Warpy API                  : GET /widget/config/{agentId}
Warpy API -> Widget                  : safe MCP connection summaries
Widget -> Customer app               : POST token_exchange_path (using current browser session)
Customer app -> Widget               : { headers, expiresAt? }
Widget -> Warpy API websocket        : chat.request + mcpAuthBundles
Warpy API -> MCP server              : list_tools / call_tool with short-lived headers
MCP server -> Warpy API              : live tool metadata or tool result
Warpy API -> Widget                  : final answer or MCP_AUTH_EXPIRED retryable error
```

## Auth behavior

### `none`

Warpy connects to the MCP server with no extra request headers.

### `static_headers`

Warpy connects with the saved static header map on every MCP request.

### `token_exchange`

Warpy never stores end-user tokens.

Instead:

1. the widget calls the customer app's token exchange endpoint with the user's existing browser session
2. the customer app returns short-lived MCP headers for that same user
3. the widget includes those headers in `mcpAuthBundles` for the active run only
4. the backend uses them for live MCP discovery and calls

If the MCP server returns an auth failure, the backend emits `MCP_AUTH_EXPIRED` as a retryable websocket error so the widget can refresh bundles once and replay the same request.

## Tool discovery

`find_tools` now merges two sources:

- DB-backed Warpy tools from `tools` / embeddings
- live MCP tools from all configured MCP connections

MCP tools are surfaced with opaque refs:

- DB tools: `db:<tool_uuid>`
- MCP tools: `mcp:<connection_uuid>:<server_tool_name>`

These refs are cached in widget pending state and Redis tool cache so MCP tools can survive a paused run without becoming persisted Warpy tool rows.

## Out of scope

- importing MCP tools into Features
- background sync or drift detection
- Warpy-managed OAuth prompts
- MCP resources or prompts
- local stdio MCP servers
