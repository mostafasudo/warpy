#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TERMINAL_BLOCKING_STATUSES = new Set(['claimed', 'sent', 'completion_pending', 'completed']);
const DIRECT_MESSAGE_FAMILIES = new Set(['email', 'linkedin_dm']);
const OUTBOUND_FAMILIES = new Set([
  'email',
  'linkedin_dm',
  'connection_request',
  'public_social_touch',
  'x_touch',
  'other_outbound',
]);
const DEFAULT_STATE_DIR = resolve(homedir(), '.codex/state/warpy-gtm');
const INDEX_FILE = 'task-guard-index.json';
const CLAIM_DIR = 'task-guard-claims';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeToken(value) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeEmail(value) {
  const raw = normalizeString(value).toLowerCase();
  const bracketed = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  const email = bracketed?.[1] ?? raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0] ?? '';
  return email || null;
}

function normalizeUrl(value) {
  const raw = normalizeString(value);
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
  } catch {
    return raw.toLowerCase().replace(/\/+$/, '');
  }

  const rawHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const host = rawHost === 'twitter.com' ? 'x.com' : rawHost;
  let path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  if (host === 'x.com') path = path.replace(/^\/@/, '/');
  return `${host}${path}`;
}

function normalizeRecipients(payload) {
  const recipients = [];
  const email = normalizeEmail(payload.contact_email ?? payload.email);
  if (email) recipients.push(`email:${email}`);

  const linkedin = normalizeUrl(payload.linkedin_url);
  if (linkedin) recipients.push(`linkedin:${linkedin}`);

  const xUrl = normalizeUrl(payload.x_url ?? payload.twitter_url);
  if (xUrl) recipients.push(`x:${xUrl}`);

  const apolloContactId = normalizeString(payload.apollo_contact_id);
  if (apolloContactId) recipients.push(`apollo-contact:${apolloContactId}`);

  const contactName = normalizeToken(payload.contact_name);
  const accountDomain = normalizeToken(payload.account_domain);
  if (contactName && accountDomain) recipients.push(`contact:${contactName}@${accountDomain}`);

  const uniqueRecipients = [...new Set(recipients)];
  if (uniqueRecipients.length > 0) return uniqueRecipients;

  throw new Error('A guard claim requires contact_email, linkedin_url, x_url, apollo_contact_id, or contact_name plus account_domain.');
}

function normalizeRecipient(payload) {
  return normalizeRecipients(payload)[0];
}

function normalizeActionFamily(payload) {
  const channel = normalizeToken(payload.channel).replace(/-/g, '_');
  const stepType = normalizeToken(payload.step_type).replace(/-/g, '_');
  const combined = `${channel} ${stepType}`;

  if (channel === 'apollo_email' || channel === 'email' || combined.includes('manual_email')) return 'email';
  if (
    combined.includes('linkedin_dm') ||
    combined.includes('inmail') ||
    (channel === 'linkedin' && (combined.includes('dm') || combined.includes('message')))
  ) return 'linkedin_dm';
  if (channel === 'apollo_task' && !combined.includes('email')) return 'apollo_task';
  if (combined.includes('connection_request') || combined.includes('connect')) return 'connection_request';
  if (channel === 'linkedin' && (combined.includes('post_interaction') || combined.includes('second_social_touch') || combined.includes('like') || combined.includes('comment'))) return 'public_social_touch';
  if (channel === 'x' || channel === 'twitter' || combined.includes('twitter') || combined.includes('x_touch')) return 'x_touch';
  return 'other_outbound';
}

function isOutboundFamily(family) {
  return OUTBOUND_FAMILIES.has(family);
}

function dateFromValue(value) {
  const raw = normalizeString(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizeLocalDate(payload, { requireLocalDate = false } = {}) {
  const localDate = dateFromValue(payload.local_date);
  if (localDate) return localDate;
  if (requireLocalDate) throw new Error('A guard claim requires local_date.');
  return (
    dateFromValue(payload.sent_at) ||
    dateFromValue(payload.apollo_completed_at) ||
    dateFromValue(payload.run_started_at) ||
    dateFromValue(payload.apollo_due_date) ||
    new Date().toISOString().slice(0, 10)
  );
}

function normalizeRunStartedAt(payload) {
  const runStartedAt = normalizeString(payload.run_started_at);
  if (!runStartedAt) throw new Error('A guard claim requires run_started_at.');
  return runStartedAt;
}

function buildGuardKeys(payload, { requireRun = true } = {}) {
  const apolloTaskId = normalizeString(payload.apollo_task_id);
  if (!apolloTaskId) throw new Error('A guard claim requires apollo_task_id.');

  const recipients = normalizeRecipients(payload);
  const recipient = recipients[0];
  const family = normalizeActionFamily(payload);
  const localDate = normalizeLocalDate(payload, { requireLocalDate: requireRun });
  const runStartedAt = requireRun ? normalizeRunStartedAt(payload) : normalizeString(payload.run_started_at);
  const keys = [
    {
      type: 'task',
      key: `task:${apolloTaskId}`,
      reason: 'apollo_task_already_touched',
    },
  ];

  if (runStartedAt && isOutboundFamily(family)) {
    for (const recipientAlias of recipients) {
      keys.push({
        type: 'recipient_run',
        key: `recipient-run:${runStartedAt}:${recipientAlias}`,
        reason: 'same_run_recipient_already_touched',
      });
    }
  }

  if (DIRECT_MESSAGE_FAMILIES.has(family)) {
    for (const recipientAlias of recipients) {
      keys.push({
        type: 'recipient_day_direct',
        key: `recipient-day:${localDate}:${recipientAlias}:direct_message`,
        reason: 'same_day_direct_recipient_already_touched',
      });
    }
  }

  return { apolloTaskId, recipient, recipients, family, localDate, runStartedAt, keys };
}

function parseJsonLine(line, lineNumber, source) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid JSON in ${source} line ${lineNumber}: ${error.message}`);
  }
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const records = [];

  lines.forEach((line, index) => {
    try {
      records.push(parseJsonLine(line, index + 1, path));
    } catch (error) {
      if (index === lines.length - 1) return;
      throw error;
    }
  });

  return records;
}

function ensureState(stateDir) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(stateDir, CLAIM_DIR), { recursive: true, mode: 0o700 });
}

function indexPath(stateDir) {
  return join(stateDir, INDEX_FILE);
}

function claimFilePath(stateDir, key) {
  return join(stateDir, CLAIM_DIR, `${sha256(key)}.json`);
}

function keyEntryForRecord(record, keyInfo, key) {
  return {
    key,
    source: 'ledger',
    status: record.status,
    apollo_task_id: normalizeString(record.apollo_task_id),
    action_key: record.action_key ?? null,
    channel: record.channel ?? null,
    step_type: record.step_type ?? null,
    contact_email: record.contact_email ?? null,
    linkedin_url: record.linkedin_url ?? null,
    sent_at: record.sent_at ?? null,
    apollo_completed_at: record.apollo_completed_at ?? null,
    family: keyInfo.family,
    recipient: keyInfo.recipient,
    recipients: keyInfo.recipients,
  };
}

function addIndexKey(index, key, entry) {
  if (!index.keys[key]) index.keys[key] = [];
  index.keys[key].push(entry);
}

function buildIndexFromLedger(records, ledgerPath) {
  const index = {
    version: 1,
    rebuilt_at: new Date().toISOString(),
    ledger_path: ledgerPath,
    keys: {},
    skipped_records: [],
  };

  records.forEach((record, offset) => {
    if (!TERMINAL_BLOCKING_STATUSES.has(record.status)) return;

    let keyInfo;
    try {
      keyInfo = buildGuardKeys(record, { requireRun: false });
    } catch (error) {
      index.skipped_records.push({
        line: offset + 1,
        apollo_task_id: record.apollo_task_id ?? null,
        status: record.status,
        reason: error.message,
      });
      return;
    }

    for (const key of keyInfo.keys) {
      addIndexKey(index, key.key, keyEntryForRecord(record, keyInfo, key.key));
    }
  });

  return index;
}

function readIndex(stateDir, ledgerPath) {
  const path = indexPath(stateDir);
  if (!existsSync(path)) return { version: 1, keys: {} };
  const index = JSON.parse(readFileSync(path, 'utf8'));
  if (index.ledger_path && ledgerPath && resolve(index.ledger_path) !== resolve(ledgerPath)) {
    return { version: 1, keys: {}, skipped_records: [{ reason: 'index_ledger_path_mismatch', index_path: path, ledger_path: ledgerPath, index_ledger_path: index.ledger_path }] };
  }
  return index;
}

function writeIndex(stateDir, index) {
  ensureState(stateDir);
  const path = indexPath(stateDir);
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, path);
}

function mergeIndexes(...indexes) {
  const merged = { version: 1, rebuilt_at: new Date().toISOString(), keys: {}, skipped_records: [] };
  const seenByKey = new Map();

  for (const index of indexes) {
    for (const [key, entries] of Object.entries(index.keys ?? {})) {
      if (!merged.keys[key]) merged.keys[key] = [];
      if (!seenByKey.has(key)) seenByKey.set(key, new Set());
      const seen = seenByKey.get(key);
      for (const entry of Array.isArray(entries) ? entries : [entries]) {
        const fingerprint = JSON.stringify({
          source: entry.source ?? null,
          status: entry.status ?? null,
          apollo_task_id: entry.apollo_task_id ?? null,
          action_key: entry.action_key ?? null,
          sent_at: entry.sent_at ?? null,
          apollo_completed_at: entry.apollo_completed_at ?? null,
        });
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        merged.keys[key].push(entry);
      }
    }
    if (Array.isArray(index.skipped_records)) merged.skipped_records.push(...index.skipped_records);
  }

  return merged;
}

function readClaimFiles(stateDir) {
  const claimsDir = join(stateDir, CLAIM_DIR);
  if (!existsSync(claimsDir)) return {};

  const claims = {};
  for (const file of readdirSync(claimsDir)) {
    if (!file.endsWith('.json')) continue;
    const path = join(claimsDir, file);
    const claim = JSON.parse(readFileSync(path, 'utf8'));
    if (!claim.key) continue;
    if (!claims[claim.key]) claims[claim.key] = [];
    claims[claim.key].push({ ...claim, source: 'claim_file' });
  }
  return claims;
}

function loadBlockingIndex({ stateDir, ledgerPath }) {
  const ledgerIndex = buildIndexFromLedger(readJsonl(ledgerPath), ledgerPath);
  const persistedIndex = readIndex(stateDir, ledgerPath);
  const claimsIndex = { version: 1, keys: readClaimFiles(stateDir) };
  return mergeIndexes(persistedIndex, ledgerIndex, claimsIndex);
}

function firstConflict(keyInfo, blockingIndex) {
  for (const key of keyInfo.keys) {
    const entries = blockingIndex.keys[key.key];
    if (!entries?.length) continue;
    const completionPending = entries.find((entry) => entry.status === 'completion_pending');
    return {
      key: key.key,
      type: key.type,
      reason: completionPending ? 'completion_pending_completion_only' : key.reason,
      completion_retry_allowed: Boolean(completionPending),
      entries,
    };
  }
  return null;
}

function writeClaimLocks(stateDir, keyInfo, payload) {
  const claimId = sha256(JSON.stringify({
    apollo_task_id: keyInfo.apolloTaskId,
    recipients: keyInfo.recipients,
    family: keyInfo.family,
    local_date: keyInfo.localDate,
    run_started_at: keyInfo.runStartedAt,
    created_at: new Date().toISOString(),
  }));
  const createdPaths = [];

  for (const key of keyInfo.keys) {
    const path = claimFilePath(stateDir, key.key);
    const claim = {
      version: 1,
      claim_id: claimId,
      key: key.key,
      key_type: key.type,
      status: 'claimed',
      created_at: new Date().toISOString(),
      apollo_task_id: keyInfo.apolloTaskId,
      recipient: keyInfo.recipient,
      recipients: keyInfo.recipients,
      family: keyInfo.family,
      local_date: keyInfo.localDate,
      run_started_at: keyInfo.runStartedAt,
      contact_email: payload.contact_email ?? null,
      linkedin_url: payload.linkedin_url ?? null,
      action_key: payload.action_key ?? null,
      copy_hash: payload.copy_hash ?? null,
    };

    try {
      writeFileSync(path, `${JSON.stringify(claim, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      createdPaths.push(path);
    } catch (error) {
      for (const createdPath of createdPaths) rmSync(createdPath, { force: true });
      if (error.code === 'EEXIST') {
        return {
          ok: false,
          decision: 'blocked',
          reason: key.reason,
          conflict_key: key.key,
          completion_retry_allowed: false,
        };
      }
      throw error;
    }
  }

  return {
    ok: true,
    decision: 'claimed',
    claim_id: claimId,
    guard_claim_keys: keyInfo.keys.map((key) => key.key),
    normalized: {
      apollo_task_id: keyInfo.apolloTaskId,
      recipient: keyInfo.recipient,
      recipients: keyInfo.recipients,
      family: keyInfo.family,
      local_date: keyInfo.localDate,
      run_started_at: keyInfo.runStartedAt,
    },
  };
}

function claim({ payload, stateDir, ledgerPath }) {
  ensureState(stateDir);
  const keyInfo = buildGuardKeys(payload);
  const blockingIndex = loadBlockingIndex({ stateDir, ledgerPath });
  const conflict = firstConflict(keyInfo, blockingIndex);

  if (conflict) {
    return {
      ok: false,
      decision: 'blocked',
      reason: conflict.reason,
      conflict_key: conflict.key,
      conflict_type: conflict.type,
      completion_retry_allowed: conflict.completion_retry_allowed,
      conflicts: conflict.entries,
      normalized: {
        apollo_task_id: keyInfo.apolloTaskId,
        recipient: keyInfo.recipient,
        recipients: keyInfo.recipients,
        family: keyInfo.family,
        local_date: keyInfo.localDate,
        run_started_at: keyInfo.runStartedAt,
      },
    };
  }

  return writeClaimLocks(stateDir, keyInfo, payload);
}

function mark({ payload, stateDir, status }) {
  if (!TERMINAL_BLOCKING_STATUSES.has(status)) {
    throw new Error(`Unsupported guard mark status: ${status}`);
  }

  ensureState(stateDir);
  const keyInfo = buildGuardKeys(payload);
  const updatedAt = new Date().toISOString();
  const updated = [];

  for (const key of keyInfo.keys) {
    const path = claimFilePath(stateDir, key.key);
    const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
      version: 1,
      claim_id: sha256(key.key),
      key: key.key,
      key_type: key.type,
      created_at: updatedAt,
      apollo_task_id: keyInfo.apolloTaskId,
      recipient: keyInfo.recipient,
      recipients: keyInfo.recipients,
      family: keyInfo.family,
      local_date: keyInfo.localDate,
      run_started_at: keyInfo.runStartedAt,
    };
    current.status = status;
    current.updated_at = updatedAt;
    current.sent_at = payload.sent_at ?? current.sent_at ?? null;
    current.apollo_completed_at = payload.apollo_completed_at ?? current.apollo_completed_at ?? null;
    writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
    updated.push(key.key);
  }

  return { ok: true, decision: 'marked', status, guard_claim_keys: updated };
}

function audit({ ledgerPath }) {
  const records = readJsonl(ledgerPath);
  const sentRecords = records.filter((record) => record.status === 'sent');
  const sentByTask = new Map();
  const sentByDirectRecipientDay = new Map();
  let replayBlocked = 0;
  const replayKeys = new Set();

  for (const record of sentRecords) {
    let keyInfo;
    try {
      keyInfo = buildGuardKeys(record, { requireRun: false });
    } catch {
      continue;
    }

    const taskRecords = sentByTask.get(keyInfo.apolloTaskId) ?? [];
    taskRecords.push(record);
    sentByTask.set(keyInfo.apolloTaskId, taskRecords);

    if (DIRECT_MESSAGE_FAMILIES.has(keyInfo.family)) {
      for (const recipient of keyInfo.recipients) {
        const directKey = `${keyInfo.localDate}:${recipient}:direct_message`;
        const directRecords = sentByDirectRecipientDay.get(directKey) ?? [];
        directRecords.push(record);
        sentByDirectRecipientDay.set(directKey, directRecords);
      }
    }

    const wouldBlock = keyInfo.keys.some((key) => replayKeys.has(key.key));
    if (wouldBlock) replayBlocked += 1;
    for (const key of keyInfo.keys) replayKeys.add(key.key);
  }

  const duplicateTasks = [...sentByTask.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([apolloTaskId, entries]) => ({
      apollo_task_id: apolloTaskId,
      sent_count: entries.length,
      action_keys: entries.map((entry) => entry.action_key ?? null),
      sent_at: entries.map((entry) => entry.sent_at ?? null),
    }));

  const duplicateDirectRecipients = [...sentByDirectRecipientDay.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([recipient_day, entries]) => ({
      recipient_day,
      sent_count: entries.length,
      apollo_task_ids: entries.map((entry) => entry.apollo_task_id ?? null),
      action_keys: entries.map((entry) => entry.action_key ?? null),
      sent_at: entries.map((entry) => entry.sent_at ?? null),
    }));

  return {
    ok: true,
    ledger_path: ledgerPath,
    sent_records: sentRecords.length,
    duplicate_task_groups: duplicateTasks.length,
    duplicate_direct_recipient_day_groups: duplicateDirectRecipients.length,
    replay_sends_that_guard_would_block: replayBlocked,
    duplicate_tasks: duplicateTasks,
    duplicate_direct_recipients: duplicateDirectRecipients,
  };
}

function readOptionValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return { command: null, help: true, stateDir: DEFAULT_STATE_DIR, ledgerPath: join(DEFAULT_STATE_DIR, 'task-action-ledger.jsonl') };
  }

  const [command, ...args] = argv;
  const options = { command, stateDir: DEFAULT_STATE_DIR, ledgerPath: join(DEFAULT_STATE_DIR, 'task-action-ledger.jsonl') };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--state-dir') options.stateDir = resolve(readOptionValue(args, ++index, arg));
    else if (arg === '--ledger') options.ledgerPath = resolve(readOptionValue(args, ++index, arg));
    else if (arg === '--payload') options.payload = JSON.parse(readOptionValue(args, ++index, arg));
    else if (arg === '--payload-file') options.payload = JSON.parse(readFileSync(resolve(readOptionValue(args, ++index, arg)), 'utf8'));
    else if (arg === '--status') options.status = readOptionValue(args, ++index, arg);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  return `Usage:
  node scripts/gtm-task-guard.mjs claim --payload-file task.json
  node scripts/gtm-task-guard.mjs mark --status sent --payload-file task.json
  node scripts/gtm-task-guard.mjs rebuild-index
  node scripts/gtm-task-guard.mjs audit

Payloads must include apollo_task_id, run_started_at, local_date, and a recipient identifier such as contact_email or linkedin_url.`;
}

function rebuildIndex({ stateDir, ledgerPath }) {
  const index = buildIndexFromLedger(readJsonl(ledgerPath), ledgerPath);
  writeIndex(stateDir, index);
  return {
    ok: true,
    decision: 'rebuilt',
    index_path: indexPath(stateDir),
    blocking_keys: Object.keys(index.keys).length,
    skipped_records: index.skipped_records.length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    console.log(usage());
    return;
  }

  let result;
  if (options.command === 'claim') {
    if (!options.payload) throw new Error('claim requires --payload or --payload-file');
    result = claim(options);
  } else if (options.command === 'mark') {
    if (!options.payload) throw new Error('mark requires --payload or --payload-file');
    if (!options.status) throw new Error('mark requires --status');
    result = mark(options);
  } else if (options.command === 'rebuild-index') {
    result = rebuildIndex(options);
  } else if (options.command === 'audit') {
    result = audit(options);
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(fileURLToPath(import.meta.url)).href === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}

export const __test__ = {
  audit,
  buildGuardKeys,
  buildIndexFromLedger,
  claim,
  mark,
  normalizeActionFamily,
  normalizeLocalDate,
  normalizeRecipient,
  normalizeRecipients,
  parseArgs,
  rebuildIndex,
};
