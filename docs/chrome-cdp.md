# Chrome CDP

Interact with your live local Chrome session: the tabs you already have open, your logged-in accounts, and the current page state. This is the default browser-validation path in this repo because it talks to Chrome directly over CDP instead of launching a separate browser.

## Why this path

`scripts/cdp.mjs` keeps one shared browser-level debugging session alive and reuses attached tab sessions. That is the key behavior for minimizing Chrome's `Allow remote debugging?` prompts.

- First attach: Chrome may show `Allow remote debugging?` once for the shared daemon.
- Later commands: reuse the same browser connection and attached tab sessions.
- New tabs opened through `scripts/cdp.mjs open`: reuse the same shared session instead of creating a new per-tab daemon.

Do not `stop` the daemon unless you want to end the debugging session. Stopping it means the next attach may require another approval click.

## Prerequisites

- Chrome, Chromium, Brave, or Edge with remote debugging enabled at `chrome://inspect/#remote-debugging`
- Node.js 22+ for the built-in `WebSocket`
- If Chrome writes `DevToolsActivePort` somewhere non-standard, set `CDP_PORT_FILE` to the full file path
- If Chrome exposes CDP on a different host, set `CDP_HOST`

The CLI auto-detects common `DevToolsActivePort` locations for macOS, Linux, Flatpak Linux, and Windows profiles. Stable Chrome is checked first.

## Commands

```bash
scripts/cdp.mjs list                              # list open tabs
scripts/cdp.mjs shot    <target> [file]           # viewport screenshot; default file goes in the runtime dir
scripts/cdp.mjs snap    <target>                  # accessibility tree snapshot
scripts/cdp.mjs html    <target> [".selector"]    # full HTML or one element
scripts/cdp.mjs eval    <target> "expression"     # evaluate JS in page context
scripts/cdp.mjs nav     <target> https://...      # navigate and wait for load
scripts/cdp.mjs net     <target>                  # resource timing summary
scripts/cdp.mjs click   <target> ".selector"      # click by CSS selector
scripts/cdp.mjs clickxy <target> <x> <y>          # click at CSS pixel coordinates
scripts/cdp.mjs type    <target> "text"           # type into the focused element
scripts/cdp.mjs loadall <target> ".selector" [ms] # click "load more" until gone
scripts/cdp.mjs evalraw <target> <method> [json]  # raw CDP command passthrough
scripts/cdp.mjs open    [url]                     # open a new tab in the shared browser session
scripts/cdp.mjs stop    [target]                  # stop the shared daemon or detach one tab session
```

`<target>` is a unique `targetId` prefix from `scripts/cdp.mjs list`.

## Runtime behavior

- Runtime files live in `$XDG_RUNTIME_DIR/cdp` when available, otherwise `~/.cache/cdp` on macOS/Linux, or `%LOCALAPPDATA%/cdp` on Windows.
- `shot` defaults to `screenshot-<target>.png` in that runtime dir.
- The shared daemon stays alive until you run `scripts/cdp.mjs stop` or Chrome closes the debugging session.
- `stop <target>` detaches one tab while keeping the shared browser session alive.

## Coordinates

`shot` saves the viewport at native resolution, so screenshot pixels and input coordinates are different on high-DPI displays.

```text
CSS px = screenshot image px / DPR
```

CDP input events such as `clickxy` take CSS pixels, not screenshot image pixels. `shot` prints the DPR and an example conversion for the current page.

## Tips

- Prefer `snap` for page structure and accessible text; use `html` only when you need raw markup.
- Use `type`, not `eval`, when entering text into cross-origin iframes. Focus the field first with `click` or `clickxy`.
- Avoid index-based DOM selection across multiple `eval` calls when the page can mutate between calls.
- Use `evalraw` for anything the CLI does not expose directly.
- If auto-detection picks the wrong browser profile, point `CDP_PORT_FILE` at the `DevToolsActivePort` file for your main Chrome profile.

## MCP fallback

The direct `scripts/cdp.mjs` path is preferred because it holds one long-lived browser connection open and minimizes repeat approvals.

If an agent requires MCP, use Chrome's official attach flow with `chrome-devtools-mcp --autoConnect`. Repo-local Cursor config already points to it in [`.cursor/mcp.json`](/Users/levw/Desktop/Levw/warpy/.cursor/mcp.json).

Before using MCP:

- Run Chrome 144 or newer
- Enable remote debugging at `chrome://inspect/#remote-debugging`
- Keep Chrome already open before the MCP client starts
- Expect the first live-session attach to require Chrome approval
