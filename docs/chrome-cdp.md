# Chrome CDP

Let your AI agent see and interact with your live Chrome session: the tabs you already have open, your logged-in accounts, and your current page state. No browser automation framework, no separate browser instance, and no re-login.

Use this whenever you want to inspect or control the current Chrome browser, validate work in a real session, or run browser actions automatically.

## Usage

```bash
scripts/cdp.mjs list                              # list open tabs
scripts/cdp.mjs shot   <target>                   # screenshot -> /tmp/screenshot.png
scripts/cdp.mjs snap   <target>                   # accessibility tree (compact, semantic)
scripts/cdp.mjs html   <target> [".selector"]     # full HTML or scoped to CSS selector
scripts/cdp.mjs eval   <target> "expression"      # evaluate JS in page context
scripts/cdp.mjs nav    <target> https://...       # navigate and wait for load
scripts/cdp.mjs net    <target>                   # network resource timing
scripts/cdp.mjs click  <target> "selector"        # click element by CSS selector
scripts/cdp.mjs clickxy <target> <x> <y>          # click at CSS pixel coordinates
scripts/cdp.mjs type   <target> "text"            # type at focused element (works in cross-origin iframes)
scripts/cdp.mjs loadall <target> "selector"       # click "load more" until gone
scripts/cdp.mjs evalraw <target> <method> [json]  # raw CDP command passthrough
scripts/cdp.mjs stop   [target]                   # stop the shared daemon or detach one tab session
```

`<target>` is a unique prefix of the `targetId` shown by `list`.

## How It Works

This connects directly to Chrome's remote debugging WebSocket with no Puppeteer and no intermediary. The first command starts one shared background daemon for the whole Chrome session. Chrome's "Allow debugging" modal should appear once for that daemon, not once per tab. After you click Allow, later commands reuse the same browser connection and the same attached tab sessions.

The daemon keeps one shared browser-level debugging session alive, attaches to tabs lazily, and caches those tab sessions until you stop it or Chrome closes the debugging session. That keeps reconnections minimal and avoids duplicate detached helper processes.

## Operational Notes

- The first command can wait for Chrome's permission dialog. If you do not click Allow within about a minute, the command fails and you can retry.
- `stop` ends the shared debugging session entirely and removes the Chrome automation banner.
- `stop <target>` detaches only that tab while keeping the shared browser session alive.
- The daemon does not idle out. Run `stop` if you want to close the session sooner.

## Official MCP Fallback

The direct `scripts/cdp.mjs` path is still the preferred workflow in this repo because it keeps one long-lived raw CDP session alive and minimizes repeated Chrome approval prompts.

If another agent only knows how to use MCP, use Chrome's official live-session attach flow with `chrome-devtools-mcp --autoConnect`.

Repo-local Cursor config is already set in [`.cursor/mcp.json`](/Users/levw/Desktop/Levw/warpy/.cursor/mcp.json):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--autoConnect"]
    }
  }
}
```

Before using it:

- Run Chrome 144 or newer.
- Enable remote debugging at `chrome://inspect/#remote-debugging`.
- Keep Chrome already open before the MCP client starts.
- Expect Chrome's `Allow debugging` prompt the first time the MCP server requests a new live-session attach.

Use MCP when the agent requires an MCP server. Use `scripts/cdp.mjs` when you want the fewest prompts and the most reliable behavior with lots of open tabs.
