import json
from collections.abc import Iterable


CONTROL_PLANE_PREFIXES = (
    "/api-key",
    "/config",
    "/features",
    "/tools",
    "/widget-components",
    "/mcp-connections",
    "/knowledge-base",
    "/agent",
)

SECTION_MANIFEST = [
    {
        "section": "Overview",
        "purpose": "Copy-paste handoff surface for coding agents.",
        "toggles": [],
    },
    {
        "section": "API Config",
        "purpose": "Configure base URLs, auth mapping, custom headers, MCP connections, and manage the single Warpy API key.",
        "toggles": ["sendCookiesWithRequests"],
    },
    {
        "section": "Features",
        "purpose": "Group tools into product surfaces and enable or disable them.",
        "toggles": ["feature.agentEnabled", "tool.agentEnabled"],
    },
    {
        "section": "Dynamic UI",
        "purpose": "Register native output components that the widget can render instead of markdown.",
        "toggles": ["widgetResponseMode", "widgetComponent.active"],
    },
    {
        "section": "Knowledge Base",
        "purpose": "Enable or disable retrieval and manage documents and websites.",
        "toggles": ["knowledgeBase.enabled"],
    },
    {
        "section": "Agent",
        "purpose": "Configure widget install, widget behavior, custom prompt, frontend capability, and security.",
        "toggles": [
            "frontendCapability.enabled",
            "widgetSuggestionsEnabled",
            "widgetSecurityDisclosureEnabled",
            "requireSignedWidgetToken",
            "userRateLimits.enabled",
        ],
    },
]

TOGGLE_MANIFEST = {
    "sendCookiesWithRequests": "When true, browser cookies are included on backend tool requests.",
    "feature.agentEnabled": "Feature-level enablement. Disabling the feature removes all child tools from the agent surface.",
    "tool.agentEnabled": "Tool-level enablement. Disabled tools stay stored but are not callable by the agent.",
    "widgetResponseMode": "Controls whether widget replies render as markdown, Warpy components, or native components.",
    "widgetComponent.active": "Controls whether a native output component is eligible for the agent to render.",
    "knowledgeBase.enabled": "Controls whether retrieval is available to Warpy for this user.",
    "frontendCapability.enabled": "Controls whether screen autopilot and frontend execution are available.",
    "widgetSuggestionsEnabled": "Controls whether starter suggestions render in the widget.",
    "widgetSecurityDisclosureEnabled": "Controls the security disclosure copy in the widget surface.",
    "requireSignedWidgetToken": "Requires the widget to exchange the Warpy API key server-side for a short-lived JWT before protected widget actions.",
    "userRateLimits.enabled": "Enables per-user rate limiting on widget actions.",
}

FRONTEND_EXAMPLE = {
    "toolType": "frontend",
    "tool": {
        "type": "function",
        "function": {
            "name": "open_order_drawer",
            "description": "Open the order drawer for the requested order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "orderId": {
                        "type": "string",
                        "description": "Order id to open.",
                    },
                    "focusTab": {
                        "type": "string",
                        "description": "Optional tab to focus after opening the drawer.",
                        "enum": ["summary", "timeline", "refunds"],
                    },
                },
                "required": ["orderId"],
            },
        },
    },
    "agentEnabled": True,
    "feature": {"mode": "existing", "id": "feature_uuid_here"},
}

WIDGET_COMPONENT_EXAMPLE = {
    "key": "invoice_summary",
    "version": "1",
    "displayName": "Invoice Summary",
    "description": "Compact invoice review card for short billing summaries.",
    "framework": "react",
    "propsSchema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Title, max 60 characters.",
            },
            "content": {
                "type": "string",
                "description": "Complete summary text, max 400 characters.",
            },
        },
        "required": ["title", "content"],
    },
    "suitability": "Use only for one compact invoice summary that fits fully in the title and content limits. Use markdown for long tables or detailed multi-step explanations.",
    "constraints": {
        "maxTitleChars": 60,
        "maxContentChars": 400,
        "outputOnly": True,
    },
    "active": True,
}

BACKEND_EXAMPLE = {
    "toolType": "backend",
    "path": "/orders/{order_id}/refunds",
    "method": "POST",
    "tool": {
        "type": "function",
        "function": {
            "name": "create_order_refund",
            "description": "Create a refund for an order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "params": {
                        "type": "object",
                        "description": "Path params for this backend tool",
                        "properties": {
                            "order_id": {
                                "type": "string",
                                "description": "Order id.",
                            }
                        },
                        "required": ["order_id"],
                    },
                    "body": {
                        "type": "object",
                        "description": "Body for this backend tool",
                        "properties": {
                            "reason": {
                                "type": "string",
                                "description": "Refund reason.",
                            },
                            "lines": {
                                "type": "array",
                                "description": "lines array",
                                "items": {
                                    "type": "object",
                                    "description": "lines item",
                                    "properties": {
                                        "lineId": {
                                            "type": "string",
                                            "description": "Line id.",
                                        },
                                        "quantity": {
                                            "type": "number",
                                            "description": "Quantity to refund.",
                                        },
                                        "metadata": {
                                            "type": "object",
                                            "description": "metadata",
                                            "properties": {
                                                "status": {
                                                    "type": "string",
                                                    "description": "Optional status override.",
                                                }
                                            },
                                        },
                                    },
                                    "required": ["lineId", "quantity"],
                                },
                            },
                        },
                        "required": ["reason", "lines"],
                    },
                },
                "required": ["params", "body"],
            },
        },
    },
    "agentEnabled": True,
    "feature": {"mode": "new", "name": "Orders"},
}


def _is_control_plane_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in CONTROL_PLANE_PREFIXES)


def _normalize_schema(schema: object) -> object:
    if isinstance(schema, dict):
        return {key: _normalize_schema(value) for key, value in schema.items()}
    if isinstance(schema, list):
        return [_normalize_schema(item) for item in schema]
    return schema


def _extract_ref_name(ref: str) -> str | None:
    if not ref.startswith("#/components/schemas/"):
        return None
    return ref.rsplit("/", 1)[-1]


def _collect_refs(node: object) -> set[str]:
    refs: set[str] = set()
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            name = _extract_ref_name(ref)
            if name:
                refs.add(name)
        for value in node.values():
            refs.update(_collect_refs(value))
    elif isinstance(node, list):
        for item in node:
            refs.update(_collect_refs(item))
    return refs


def _iter_control_plane_operations(openapi: dict) -> Iterable[tuple[str, str, dict]]:
    for path, path_item in sorted(openapi.get("paths", {}).items()):
        if not _is_control_plane_path(path):
            continue
        for method in ("get", "post", "put", "patch", "delete"):
            operation = path_item.get(method)
            if isinstance(operation, dict):
                yield path, method.upper(), operation


def _render_section_manifest() -> str:
    lines = [
        "## Dashboard Sections And Toggles",
        "",
        "| Section | What it does | Toggles |",
        "| --- | --- | --- |",
    ]
    for item in SECTION_MANIFEST:
        toggles = ", ".join(f"`{toggle}`" for toggle in item["toggles"]) or "None"
        lines.append(f"| {item['section']} | {item['purpose']} | {toggles} |")
    lines.extend([
        "",
        "### Toggle Meanings",
        "",
        "| Toggle | Meaning |",
        "| --- | --- |",
    ])
    for key, value in TOGGLE_MANIFEST.items():
        lines.append(f"| `{key}` | {value} |")
    return "\n".join(lines)


def _extract_request_schema_name(operation: dict) -> str:
    content = (operation.get("requestBody") or {}).get("content") or {}
    json_body = content.get("application/json") or next(iter(content.values()), {})
    schema = json_body.get("schema")
    if isinstance(schema, dict):
        ref = schema.get("$ref")
        if isinstance(ref, str):
            return _extract_ref_name(ref) or "inline"
        return "inline"
    return "—"


def _extract_response_schema_names(operation: dict) -> str:
    names: list[str] = []
    for code in ("200", "201"):
        response = (operation.get("responses") or {}).get(code) or {}
        content = response.get("content") or {}
        json_body = content.get("application/json") or next(iter(content.values()), {})
        schema = json_body.get("schema")
        if isinstance(schema, dict):
            if isinstance(schema.get("$ref"), str):
                name = _extract_ref_name(schema["$ref"])
                if name:
                    names.append(name)
                    continue
            refs = sorted(_collect_refs(schema))
            if refs:
                names.extend(refs)
            else:
                names.append("inline")
    deduped = list(dict.fromkeys(names))
    return ", ".join(f"`{name}`" for name in deduped) if deduped else "—"


def _render_openapi_inventory(openapi: dict) -> str:
    blocks: list[str] = [
        "## Control Plane Endpoints",
        "",
        "| Endpoint | Purpose | Request | Response |",
        "| --- | --- | --- | --- |",
    ]
    for path, method, operation in _iter_control_plane_operations(openapi):
        purpose = operation.get("summary") or operation.get("operationId") or "Control-plane operation"
        request_schema = _extract_request_schema_name(operation)
        response_schemas = _extract_response_schema_names(operation)
        blocks.append(
            f"| `{method} {path}` | {purpose} | {f'`{request_schema}`' if request_schema != '—' else '—'} | {response_schemas} |"
        )
    return "\n".join(blocks).rstrip()


def _render_schema_inventory(openapi: dict) -> str:
    components = openapi.get("components", {}).get("schemas", {})
    relevant_refs: set[str] = set()
    for _, _, operation in _iter_control_plane_operations(openapi):
        relevant_refs.update(_collect_refs(operation.get("requestBody")))
        relevant_refs.update(_collect_refs(operation.get("responses")))

    blocks = ["## Referenced Schemas", ""]
    for name in sorted(relevant_refs):
        schema = components.get(name)
        if not isinstance(schema, dict):
            continue
        blocks.extend([
            f"### `{name}`",
            "",
            "```json",
            json.dumps(_normalize_schema(schema), indent=2, sort_keys=True),
            "```",
            "",
        ])
    return "\n".join(blocks).rstrip()


def build_integrate_warpy_markdown(openapi: dict) -> str:
    config_example = json.dumps(
        {
            "baseUrl": {
                "local": "http://localhost:8000",
                "production": "https://api.your-product.com",
            },
            "auth": {
                "mode": "header",
                "source": "localStorage",
                "key": "access_token",
                "authType": "bearer",
            },
            "sendCookiesWithRequests": False,
            "headers": {
                "X-Tenant-Id": {
                    "source": "localStorage",
                    "key": "tenant_id",
                }
            },
        },
        indent=2,
        sort_keys=True,
    )
    backend_example = json.dumps(BACKEND_EXAMPLE, indent=2, sort_keys=True)
    frontend_example = json.dumps(FRONTEND_EXAMPLE, indent=2, sort_keys=True)
    widget_component_example = json.dumps(WIDGET_COMPONENT_EXAMPLE, indent=2, sort_keys=True)

    sections = [
        """# Warpy Agent Integration Manual

This file is the **single source of truth for agents**. It must be kept up to date. If the Warpy dashboard changes, this file must change with it.

Use this document when a coding agent has:
- this markdown file
- one Warpy API key

With those two inputs, the agent must be able to operate the supported Warpy control plane end to end without opening the dashboard.

## What Warpy Is

Warpy is an AI execution layer for B2B dashboards. It is not a generic chatbot. It translates user intent into:
- backend tool calls against approved product APIs
- frontend tool calls through `window.warpy(name, vars)`
- screen autopilot actions when frontend capability is enabled
- grounded answers using the knowledge base

All state-changing actions must use the same control-plane API the dashboard uses.

## Initial Setup Flow

Set up Warpy in this order:

1. Configure the API layer: local and production base URLs, authorization, cookie behavior, and any custom headers.
2. Embed the widget into the host product so there is a real runtime surface to test.
3. Configure backend and frontend tools against the embedded runtime.

## Step 1: Configure The API Layer

The first thing an agent should do is inspect the host codebase and determine how authenticated backend requests work:
- local and production API base URLs
- `Authorization` header source, if the host app uses token auth
- browser cookie behavior, if the host app uses cookie auth
- required tenant, workspace, or custom headers

Then configure Warpy through `PUT /config`.

### Auth Rules

- If the host app uses an Authorization header, map it through `auth.mode = "header"`.
- If the host app uses cookies, set `sendCookiesWithRequests = true`.
- Additional fixed or mapped headers go in `headers`.
- The agent must inspect the codebase and choose the right source instead of guessing.

### Config Example

```json""".rstrip(),
        config_example,
        """```

## Step 2: Embed The Widget

After API config exists, embed the widget into the host product. The widget is the runtime surface the end user will actually use, and it needs the selected environment base URL from the API config.

### React

```tsx
import { Widget } from "@warpy-ai/widget/react"

<Widget
  agentId="YOUR_AGENT_ID"
  baseUrl="https://api.your-product.com"
  scriptSrc="https://cdn.warpy.ai/widget.js"
/>
```

### Vue

```vue
<script setup>
import { Widget } from "@warpy-ai/widget/vue"
</script>

<template>
  <Widget
    agentId="YOUR_AGENT_ID"
    baseUrl="https://api.your-product.com"
    scriptSrc="https://cdn.warpy.ai/widget.js"
  />
</template>
```

### Angular

```html
<warpy-widget
  agentId="YOUR_AGENT_ID"
  baseUrl="https://api.your-product.com"
  scriptSrc="https://cdn.warpy.ai/widget.js"
></warpy-widget>
```

### Svelte

```svelte
<script>
  import Widget from "@warpy-ai/widget/svelte"
</script>

<Widget
  agentId="YOUR_AGENT_ID"
  baseUrl="https://api.your-product.com"
  scriptSrc="https://cdn.warpy.ai/widget.js"
/>
```

### Vanilla JS

```js
import { mountWidget } from "@warpy-ai/widget"

const widget = mountWidget({
  agentId: "YOUR_AGENT_ID",
  baseUrl: "https://api.your-product.com",
  scriptSrc: "https://cdn.warpy.ai/widget.js",
})
```

### Script Tag

```html
<script
  src="https://cdn.warpy.ai/widget.js"
  data-agent-id="YOUR_AGENT_ID"
  data-base-url="https://api.your-product.com"
></script>
```

## Step 3: Configure Backend And Frontend Tools

After the widget is embedded, configure the backend and frontend tools the agent may use. Use the live widget runtime to validate that requests reach the configured base URL with the expected auth and headers, and that frontend handlers execute in the host app.

## Dynamic Widget UI

Widget replies can render in three modes:
- `markdown`: plain text and markdown
- `warpy_components`: Warpy's responsive built-in output components, styled by the widget theme
- `native_components`: components from the host app, registered in the widget runtime

Warpy always stores and sends a complete markdown fallback. Native components are output-only; do not register forms, buttons, or destructive controls here.

### Native Component Runtime Example

```tsx
import { Widget } from "@warpy-ai/widget/react"

const components = [
  { key: "invoice_summary", version: "1", component: InvoiceSummary }
]

<Widget
  agentId="YOUR_AGENT_ID"
  baseUrl="https://api.your-product.com"
  scriptSrc="https://cdn.warpy.ai/widget.js"
  components={components}
/>
```

### Native Component Definition Example

Register the matching component contract through `POST /widget-components`.

```json""".rstrip(),
        widget_component_example,
        """```

### Component Drift Detection

An agent should compare:
- local component prop types, stories, or JSON schemas
- current Warpy component definitions from `/widget-components`

The agent must detect new props, removed props, type changes, character limits, row/item limits, and suitability changes. It must explain the diff and ask for confirmation before calling `POST`, `PUT`, or `DELETE /widget-components`.

## Warpy API Key

- There is **one Warpy API key per user**.
- The same key is reused across agent operations, widget security, and direct API usage.
- Rotation happens only in the consolidated API key section and through `POST /api-key/rotate`.
- The overview page is copy-only. It must never rotate or manage the key.

## Confirmation Rules

Warpy does **not** do API-level confirmation. The coding agent must ask the human before any state-changing write.

Required behavior:
1. inspect current Warpy state
2. inspect the host codebase or backend contract
3. explain the proposed change in plain language
4. ask the user to confirm
5. only after confirmation, call the Warpy write endpoint

Example:

> I found that `create_order_refund` now accepts a new optional field `status`. I can update the Warpy tool schema to match. Confirm and I will apply the change.

Never silently create, update, delete, rotate, or repair.

## Backend Tool Definition

Backend tools use the current dashboard payload shape. They are stored as OpenAI-style function tools plus HTTP metadata.

### OpenAI Tool Spec Mapping

- `tool.type` must be `"function"`
- `tool.function.name` is the callable tool name
- `tool.function.description` explains when the agent should use it
- `tool.function.parameters` is exact JSON Schema
- For backend tools, HTTP metadata lives alongside the tool spec in:
  - `toolType`
  - `path`
  - `method`

### Backend Tool Example

```json""".rstrip(),
        backend_example,
        """```

Notes:
- Nested objects are expressed with `type: "object"` and nested `properties`.
- Arrays use `type: "array"` and `items`.
- Optional fields are omitted from `required`.
- `GET` backend tools must not include a `body`.

## Frontend Tool Definition

Frontend tools still use the same OpenAI-style function spec, but execution happens in the browser.

### Frontend Runtime Contract

```js
window.warpy = async (toolName, vars) => {
  if (toolName === "open_order_drawer") {
    return { ok: true, orderId: vars.orderId }
  }

  throw new Error(`Unknown tool: ${toolName}`)
}
```

### Frontend Tool Example

```json""".rstrip(),
        frontend_example,
        """```

## Drift Detection Workflow

Drift detection is first-class. It is not optional polish.

An agent should regularly compare:
- backend endpoints and request contracts in the host codebase or OpenAPI
- current Warpy tool definitions from `/tools` and `/features`

The agent must detect and explain:
- new fields
- removed fields
- type changes
- enum changes
- path or method changes
- renamed operations

### Required Repair Flow

1. fetch current Warpy tool definition
2. inspect the source-of-truth backend contract
3. compute a diff
4. explain the delta to the user
5. ask for confirmation
6. call `PUT /tools/{tool_id}` only after confirmation

No silent auto-fixes.
""",
        _render_section_manifest(),
        """

## Endpoint Usage Guidance

- Read current state with `GET` routes before proposing writes.
- Use `POST /api-key/reveal` only when the human explicitly asked to copy or use the current key.
- Use `POST /api-key/rotate` only after explicit confirmation.
- Use the same `/tools`, `/features`, `/config`, `/knowledge-base`, `/agent`, and `/mcp-connections` routes the dashboard uses.
""",
        _render_openapi_inventory(openapi),
        "",
        _render_schema_inventory(openapi),
    ]
    return "\n\n".join(section.strip("\n") for section in sections if section)
