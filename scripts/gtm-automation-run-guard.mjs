#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_STATE_DIR = resolve(homedir(), '.codex/state/warpy-automation-locks');
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const RECLAIM_STALE_AFTER_MS = 5 * 60 * 1000;
const OWNER_FILE = 'owner.json';

function iso(ms) {
  return new Date(ms).toISOString();
}

function normalizeAutomationId(value) {
  const automationId = String(value ?? '').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(automationId)) {
    throw new Error('automation_id must contain only letters, numbers, dots, underscores, or dashes.');
  }
  return automationId;
}

function normalizePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function ensureStateDir(stateDir) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
}

function lockDirPath(stateDir, automationId) {
  return join(stateDir, normalizeAutomationId(automationId));
}

function reclaimDirPath(stateDir, automationId) {
  return join(stateDir, `${normalizeAutomationId(automationId)}.reclaim`);
}

function archiveDirPath(stateDir, automationId, nowMs) {
  return join(stateDir, `${normalizeAutomationId(automationId)}.stale.${nowMs}.${randomUUID()}`);
}

function ownerPath(lockDir) {
  return join(lockDir, OWNER_FILE);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readOwner(lockDir) {
  try {
    return readJson(ownerPath(lockDir));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return {
      version: 1,
      read_error: error.message,
      claimed_at_ms: statSync(lockDir).mtimeMs,
      stale_after_ms: DEFAULT_STALE_AFTER_MS,
    };
  }
}

function pathAgeMs(path, nowMs) {
  return nowMs - statSync(path).mtimeMs;
}

function ownerClaimedAtMs(owner, lockDir) {
  if (Number.isFinite(owner?.claimed_at_ms)) return owner.claimed_at_ms;
  return statSync(lockDir).mtimeMs;
}

function ownerStaleAfterMs(owner, fallbackStaleAfterMs) {
  if (Number.isSafeInteger(owner?.stale_after_ms) && owner.stale_after_ms > 0) {
    return owner.stale_after_ms;
  }
  return fallbackStaleAfterMs;
}

function summarizeOwner(owner, lockDir, nowMs, fallbackStaleAfterMs) {
  const claimedAtMs = ownerClaimedAtMs(owner, lockDir);
  const staleAfterMs = ownerStaleAfterMs(owner, fallbackStaleAfterMs);
  return {
    owner_token: owner?.owner_token ?? null,
    claimed_at: owner?.claimed_at ?? iso(claimedAtMs),
    claimed_at_ms: claimedAtMs,
    stale_after_ms: staleAfterMs,
    expires_at: iso(claimedAtMs + staleAfterMs),
    age_ms: Math.max(0, nowMs - claimedAtMs),
  };
}

function isOwnerStale(owner, lockDir, nowMs, fallbackStaleAfterMs) {
  const summary = summarizeOwner(owner, lockDir, nowMs, fallbackStaleAfterMs);
  return nowMs - summary.claimed_at_ms >= summary.stale_after_ms;
}

function writeOwner(lockDir, owner) {
  const path = ownerPath(lockDir);
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(owner, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, path);
}

function buildOwner({ automationId, ownerToken, staleAfterMs, nowMs }) {
  return {
    version: 1,
    automation_id: automationId,
    owner_token: ownerToken,
    claimed_at: iso(nowMs),
    claimed_at_ms: nowMs,
    stale_after_ms: staleAfterMs,
    expires_at: iso(nowMs + staleAfterMs),
    pid: process.pid,
    hostname: hostname(),
    cwd: process.cwd(),
  };
}

function claimFresh({ automationId, ownerToken, stateDir, staleAfterMs, nowMs, reclaimed = false, previousOwner = null }) {
  const lockDir = lockDirPath(stateDir, automationId);
  const owner = buildOwner({ automationId, ownerToken, staleAfterMs, nowMs });
  mkdirSync(lockDir, { mode: 0o700 });

  try {
    writeOwner(lockDir, owner);
  } catch (error) {
    rmSync(lockDir, { recursive: true, force: true });
    throw error;
  }

  return {
    ok: true,
    decision: 'claimed',
    automation_id: automationId,
    owner_token: ownerToken,
    lock_path: lockDir,
    claimed_at: owner.claimed_at,
    expires_at: owner.expires_at,
    stale_after_ms: staleAfterMs,
    reclaimed,
    previous_owner: previousOwner,
  };
}

function removeStaleReclaimDir(reclaimDir, nowMs) {
  if (!existsSync(reclaimDir)) return;
  if (pathAgeMs(reclaimDir, nowMs) < RECLAIM_STALE_AFTER_MS) return;
  rmSync(reclaimDir, { recursive: true, force: true });
}

function withReclaimLock({ automationId, stateDir, nowMs }, callback) {
  const reclaimDir = reclaimDirPath(stateDir, automationId);
  removeStaleReclaimDir(reclaimDir, nowMs);

  try {
    mkdirSync(reclaimDir, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      return {
        ok: false,
        decision: 'blocked',
        reason: 'stale_reclaim_in_progress',
        automation_id: automationId,
      };
    }
    throw error;
  }

  try {
    return callback();
  } finally {
    rmSync(reclaimDir, { recursive: true, force: true });
  }
}

function reclaimStaleLock({ automationId, ownerToken, stateDir, staleAfterMs, nowMs }) {
  return withReclaimLock({ automationId, stateDir, nowMs }, () => {
    const lockDir = lockDirPath(stateDir, automationId);
    if (!existsSync(lockDir)) {
      return claimFresh({ automationId, ownerToken, stateDir, staleAfterMs, nowMs, reclaimed: true });
    }

    const owner = readOwner(lockDir);
    if (!isOwnerStale(owner, lockDir, nowMs, staleAfterMs)) {
      return {
        ok: false,
        decision: 'blocked',
        reason: 'active_run_exists',
        automation_id: automationId,
        active_owner: summarizeOwner(owner, lockDir, nowMs, staleAfterMs),
      };
    }

    const previousOwner = summarizeOwner(owner, lockDir, nowMs, staleAfterMs);
    const archiveDir = archiveDirPath(stateDir, automationId, nowMs);
    try {
      renameSync(lockDir, archiveDir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const result = claimFresh({
      automationId,
      ownerToken,
      stateDir,
      staleAfterMs,
      nowMs,
      reclaimed: true,
      previousOwner,
    });
    rmSync(archiveDir, { recursive: true, force: true });
    return result;
  });
}

function claim(options) {
  const automationId = normalizeAutomationId(options.automationId);
  const stateDir = resolve(options.stateDir ?? DEFAULT_STATE_DIR);
  const staleAfterMs = normalizePositiveInteger(options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS, 'stale_after_ms');
  const nowMs = options.nowMs ?? Date.now();
  const ownerToken = options.ownerToken ?? randomUUID();
  const reclaimDir = reclaimDirPath(stateDir, automationId);
  const lockDir = lockDirPath(stateDir, automationId);

  ensureStateDir(stateDir);

  if (existsSync(reclaimDir)) {
    removeStaleReclaimDir(reclaimDir, nowMs);
    if (existsSync(reclaimDir)) {
      return {
        ok: false,
        decision: 'blocked',
        reason: 'stale_reclaim_in_progress',
        automation_id: automationId,
      };
    }
  }

  try {
    return claimFresh({ automationId, ownerToken, stateDir, staleAfterMs, nowMs });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  const owner = readOwner(lockDir);
  if (!isOwnerStale(owner, lockDir, nowMs, staleAfterMs)) {
    return {
      ok: false,
      decision: 'blocked',
      reason: 'active_run_exists',
      automation_id: automationId,
      active_owner: summarizeOwner(owner, lockDir, nowMs, staleAfterMs),
    };
  }

  return reclaimStaleLock({ automationId, ownerToken, stateDir, staleAfterMs, nowMs });
}

function release(options) {
  const automationId = normalizeAutomationId(options.automationId);
  const stateDir = resolve(options.stateDir ?? DEFAULT_STATE_DIR);
  const ownerToken = String(options.ownerToken ?? '').trim();
  if (!ownerToken) throw new Error('release requires owner_token.');

  const lockDir = lockDirPath(stateDir, automationId);
  if (!existsSync(lockDir)) {
    return {
      ok: false,
      decision: 'release_missing',
      reason: 'lock_missing',
      automation_id: automationId,
    };
  }

  const owner = readOwner(lockDir);
  if (owner?.owner_token !== ownerToken) {
    return {
      ok: false,
      decision: 'release_denied',
      reason: 'owner_token_mismatch',
      automation_id: automationId,
      active_owner_token: owner?.owner_token ?? null,
    };
  }

  rmSync(lockDir, { recursive: true, force: true });
  return {
    ok: true,
    decision: 'released',
    automation_id: automationId,
  };
}

function status(options) {
  const automationId = normalizeAutomationId(options.automationId);
  const stateDir = resolve(options.stateDir ?? DEFAULT_STATE_DIR);
  const staleAfterMs = normalizePositiveInteger(options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS, 'stale_after_ms');
  const nowMs = options.nowMs ?? Date.now();
  const lockDir = lockDirPath(stateDir, automationId);

  if (!existsSync(lockDir)) {
    return {
      ok: true,
      decision: 'missing',
      automation_id: automationId,
    };
  }

  const owner = readOwner(lockDir);
  return {
    ok: true,
    decision: 'active',
    automation_id: automationId,
    stale: isOwnerStale(owner, lockDir, nowMs, staleAfterMs),
    active_owner: summarizeOwner(owner, lockDir, nowMs, staleAfterMs),
  };
}

function readOptionValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return { command: null, help: true };
  }

  const [command, ...args] = argv;
  const options = { command };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--automation-id') options.automationId = readOptionValue(args, ++index, arg);
    else if (arg === '--owner-token') options.ownerToken = readOptionValue(args, ++index, arg);
    else if (arg === '--state-dir') options.stateDir = resolve(readOptionValue(args, ++index, arg));
    else if (arg === '--stale-after-ms') options.staleAfterMs = normalizePositiveInteger(readOptionValue(args, ++index, arg), 'stale_after_ms');
    else if (arg === '--now-ms') options.nowMs = normalizePositiveInteger(readOptionValue(args, ++index, arg), 'now_ms');
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  return `Usage:
  node scripts/gtm-automation-run-guard.mjs claim --automation-id warpy-gtm-task-executor
  node scripts/gtm-automation-run-guard.mjs release --automation-id warpy-gtm-task-executor --owner-token <token>
  node scripts/gtm-automation-run-guard.mjs status --automation-id warpy-gtm-task-executor

The claim command prints JSON. If decision is "blocked", stop the automation before reading sources or touching GTM platforms.`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    console.log(usage());
    return;
  }

  if (!options.automationId) throw new Error(`${options.command} requires --automation-id.`);

  let result;
  if (options.command === 'claim') result = claim(options);
  else if (options.command === 'release') result = release(options);
  else if (options.command === 'status') result = status(options);
  else throw new Error(`Unknown command: ${options.command}`);

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, decision: 'error', reason: error.message }, null, 2));
    process.exit(1);
  });
}

export const __test__ = {
  DEFAULT_STATE_DIR,
  DEFAULT_STALE_AFTER_MS,
  claim,
  lockDirPath,
  normalizeAutomationId,
  parseArgs,
  release,
  status,
};
