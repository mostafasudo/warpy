#!/usr/bin/env node

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import process from "node:process"

const args = process.argv.slice(2)

if (args[0] === "--") {
  args.shift()
}

if (args.length === 0) {
  console.error("Usage: node scripts/with-agent-env.mjs <command> [args...]")
  process.exit(1)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const envPath = resolve(repoRoot, ".env")

if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}

const env = { ...process.env }

if (env.AWS_ACCESS_KEY && !env.AWS_ACCESS_KEY_ID) {
  env.AWS_ACCESS_KEY_ID = env.AWS_ACCESS_KEY
}

if (env.AWS_SECRET_KEY && !env.AWS_SECRET_ACCESS_KEY) {
  env.AWS_SECRET_ACCESS_KEY = env.AWS_SECRET_KEY
}

if (env.AWS_REGION) {
  env.AWS_DEFAULT_REGION ||= env.AWS_REGION
}

if (env.GITHUB_TOKEN && !env.GH_TOKEN) {
  env.GH_TOKEN = env.GITHUB_TOKEN
}

const child = spawn(args[0], args.slice(1), {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
})

child.on("error", (error) => {
  console.error(error.message)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
