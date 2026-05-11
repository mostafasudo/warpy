import react from "@vitejs/plugin-react"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv, type Plugin } from "vite"

const WIDGET_ENVIRONMENT_TOKEN = "__WARPY_DASHBOARD_ENVIRONMENT__"
const widgetScriptPath = fileURLToPath(new URL("./public/widget/agent.js", import.meta.url))

const serializeWidgetEnvironment = (environment: string | undefined) =>
  JSON.stringify(environment ?? "").slice(1, -1)

const widgetEnvironmentPlugin = (environment: string | undefined): Plugin => {
  const renderWidgetScript = () =>
    fs
      .readFileSync(widgetScriptPath, "utf8")
      .replaceAll(WIDGET_ENVIRONMENT_TOKEN, serializeWidgetEnvironment(environment))

  return {
    name: "warpy-widget-environment",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0]
        if (pathname !== "/widget/agent.js") return next()
        if (req.method && req.method !== "GET" && req.method !== "HEAD") return next()

        res.statusCode = 200
        res.setHeader("Content-Type", "application/javascript; charset=utf-8")
        res.end(req.method === "HEAD" ? "" : renderWidgetScript())
      })
    },
    writeBundle(options) {
      const outDir = options.dir ? path.resolve(process.cwd(), options.dir) : path.resolve(process.cwd(), "dist")
      const widgetOutputPath = path.join(outDir, "widget", "agent.js")
      fs.mkdirSync(path.dirname(widgetOutputPath), { recursive: true })
      fs.writeFileSync(widgetOutputPath, renderWidgetScript())
    },
  }
}

const loadDashboardEnv = (mode: string, cwd: string) => ({
  ...loadEnv(mode, path.resolve(cwd, ".."), "VITE_"),
  ...loadEnv(mode, path.resolve(cwd, ".."), "ENVIRONMENT"),
  ...loadEnv(mode, cwd, "VITE_"),
  ...loadEnv(mode, cwd, "ENVIRONMENT"),
})

export default defineConfig(({ mode }) => {
  const cwd = process.cwd()
  const env = loadDashboardEnv(mode, cwd)
  const widgetCdnUrl = process.env.VITE_WIDGET_CDN_URL ?? env.VITE_WIDGET_CDN_URL
  const environment = process.env.ENVIRONMENT ?? env.ENVIRONMENT

  return {
    define: {
      __VITE_WIDGET_CDN_URL__: widgetCdnUrl ? JSON.stringify(widgetCdnUrl) : "undefined"
    },
    plugins: [widgetEnvironmentPlugin(environment), react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    },
    server: {
      host: true,
      port: Number(process.env.FRONTEND_PORT || 5173),
      strictPort: true,
      watch: {
        usePolling: true
      }
    }
  }
})
