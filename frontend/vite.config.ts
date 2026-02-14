import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { fileURLToPath } from "node:url"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_")
  const widgetCdnUrl = env.VITE_WIDGET_CDN_URL

  return {
    define: {
      __VITE_WIDGET_CDN_URL__: widgetCdnUrl ? JSON.stringify(widgetCdnUrl) : "undefined"
    },
    plugins: [react()],
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
