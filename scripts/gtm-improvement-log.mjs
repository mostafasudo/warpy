#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_STATE_DIR = resolve(homedir(), '.codex/state/warpy-gtm');
const LOG_FILE = 'improvement-log.jsonl';
const INDEX_FILE = 'improvement-log-index.json';
const VALID_SOURCE_AUTOMATIONS = new Set([
  'warpy-gtm-lead-builder',
  'warpy-gtm-task-executor',
  'warpy-gtm-improvement-review',
  'manual',
]);
const VALID_CATEGORIES = new Set([
  'bug',
  'optimization',
  'data_quality',
  'copy_quality',
  'platform_reliability',
  'observability',
  'process',
]);
const VALID_PRIORITIES = new Set(['p1', 'p2', 'p3']);
const VALID_IMPACT_AREAS = new Set([
  'interested_leads',
  'autonomy',
  'safety',
  'copy_quality',
  'data_quality',
  'deliverability',
  'throughput',
  'platform_reliability',
]);

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeToken(value) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

function requireString(payload, key, maxLength = 2000) {
  const value = normalizeString(payload[key]);
  if (!value) throw new Error(`${key} is required.`);
  if (value.length > maxLength) throw new Error(`${key} must be at most ${maxLength} characters.`);
  return value;
}

function normalizeArray(value, key, maxItems = 8, maxLength = 500) {
  if (value == null || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => {
      if (item.length > maxLength) throw new Error(`${key} entries must be at most ${maxLength} characters.`);
      return item;
    });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function noteFingerprint(note) {
  return sha256([
    note.source_automation,
    note.category,
    note.impact_area,
    normalizeString(note.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  ].join('|')).slice(0, 16);
}

function normalizeNote(payload, now = new Date()) {
  const sourceAutomation = normalizeToken(payload.source_automation);
  if (!VALID_SOURCE_AUTOMATIONS.has(sourceAutomation)) {
    throw new Error(`source_automation must be one of: ${[...VALID_SOURCE_AUTOMATIONS].join(', ')}.`);
  }

  const category = normalizeToken(payload.category);
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`category must be one of: ${[...VALID_CATEGORIES].join(', ')}.`);
  }

  const priority = normalizeToken(payload.priority ?? payload.severity);
  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error('priority must be p1, p2, or p3.');
  }

  const impactArea = normalizeToken(payload.impact_area);
  if (!VALID_IMPACT_AREAS.has(impactArea)) {
    throw new Error(`impact_area must be one of: ${[...VALID_IMPACT_AREAS].join(', ')}.`);
  }

  const confidence = normalizeToken(payload.confidence);
  if (confidence !== 'high') {
    throw new Error('confidence must be high. Only obvious bugs or obvious improvements belong in the GTM improvement log.');
  }

  const note = {
    version: 1,
    event: 'created',
    id: randomUUID(),
    status: 'open',
    created_at: now.toISOString(),
    source_automation: sourceAutomation,
    run_id: normalizeString(payload.run_id) || null,
    category,
    priority,
    impact_area: impactArea,
    confidence,
    title: requireString(payload, 'title', 160),
    observation: requireString(payload, 'observation', 1800),
    impact_on_goal: requireString(payload, 'impact_on_goal', 1200),
    suggested_fix: requireString(payload, 'suggested_fix', 1800),
    evidence: normalizeArray(payload.evidence, 'evidence'),
    artifact_paths: normalizeArray(payload.artifact_paths, 'artifact_paths'),
    platform_refs: normalizeArray(payload.platform_refs, 'platform_refs'),
  };
  note.fingerprint = normalizeString(payload.fingerprint) || noteFingerprint(note);
  return note;
}

function ensureState(stateDir) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
}

function logPath(stateDir) {
  return join(stateDir, LOG_FILE);
}

function indexPath(stateDir) {
  return join(stateDir, INDEX_FILE);
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readIndex(stateDir) {
  return readJson(indexPath(stateDir), { version: 1, items: {} });
}

function writeJsonAtomic(path, value) {
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, path);
}

function appendJsonl(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: 'a', mode: 0o600 });
}

function occurrenceFromNote(note, seenAt) {
  return {
    seen_at: seenAt,
    source_automation: note.source_automation,
    run_id: note.run_id,
    evidence: note.evidence,
    artifact_paths: note.artifact_paths,
    platform_refs: note.platform_refs,
  };
}

function add({ payload, stateDir = DEFAULT_STATE_DIR, now = new Date() }) {
  const resolvedStateDir = resolve(stateDir);
  ensureState(resolvedStateDir);
  const note = normalizeNote(payload, now);
  const index = readIndex(resolvedStateDir);
  const existing = index.items[note.fingerprint];
  const seenAt = now.toISOString();

  if (existing && existing.status === 'open') {
    const recentOccurrences = [...(existing.recent_occurrences ?? []), occurrenceFromNote(note, seenAt)].slice(-10);
    index.items[note.fingerprint] = {
      ...existing,
      last_seen_at: seenAt,
      occurrence_count: (existing.occurrence_count ?? 1) + 1,
      priority: existing.priority <= note.priority ? existing.priority : note.priority,
      recent_occurrences: recentOccurrences,
    };
    const event = {
      version: 1,
      event: 'observed_again',
      id: randomUUID(),
      fingerprint: note.fingerprint,
      original_id: existing.id,
      observed_at: seenAt,
      source_automation: note.source_automation,
      run_id: note.run_id,
      evidence: note.evidence,
      artifact_paths: note.artifact_paths,
      platform_refs: note.platform_refs,
    };
    appendJsonl(logPath(resolvedStateDir), event);
    writeJsonAtomic(indexPath(resolvedStateDir), index);
    return {
      ok: true,
      decision: 'deduped',
      fingerprint: note.fingerprint,
      id: existing.id,
      occurrence_count: index.items[note.fingerprint].occurrence_count,
      log_path: logPath(resolvedStateDir),
      index_path: indexPath(resolvedStateDir),
    };
  }

  const item = {
    ...note,
    first_seen_at: note.created_at,
    last_seen_at: note.created_at,
    occurrence_count: 1,
    recent_occurrences: [occurrenceFromNote(note, note.created_at)],
  };
  index.items[note.fingerprint] = item;
  appendJsonl(logPath(resolvedStateDir), note);
  writeJsonAtomic(indexPath(resolvedStateDir), index);

  return {
    ok: true,
    decision: 'recorded',
    fingerprint: note.fingerprint,
    id: note.id,
    log_path: logPath(resolvedStateDir),
    index_path: indexPath(resolvedStateDir),
  };
}

function itemScore(item) {
  const priorityScore = { p1: 300, p2: 200, p3: 100 }[item.priority] ?? 0;
  const impactScore = {
    interested_leads: 40,
    autonomy: 35,
    safety: 30,
    deliverability: 25,
    copy_quality: 20,
    data_quality: 15,
    platform_reliability: 15,
    throughput: 10,
  }[item.impact_area] ?? 0;
  return priorityScore + impactScore + Math.min(50, (item.occurrence_count ?? 1) * 5);
}

function report({ stateDir = DEFAULT_STATE_DIR, days = 90, now = new Date() } = {}) {
  const resolvedStateDir = resolve(stateDir);
  ensureState(resolvedStateDir);
  const index = readIndex(resolvedStateDir);
  const cutoffMs = now.getTime() - Number(days) * 24 * 60 * 60 * 1000;
  const openItems = Object.values(index.items)
    .filter((item) => item.status === 'open')
    .filter((item) => Date.parse(item.last_seen_at ?? item.created_at) >= cutoffMs)
    .sort((a, b) => itemScore(b) - itemScore(a) || String(b.last_seen_at).localeCompare(String(a.last_seen_at)));

  const countBy = (key) => openItems.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] ?? 0) + 1;
    return counts;
  }, {});

  return {
    ok: true,
    state_dir: resolvedStateDir,
    generated_at: now.toISOString(),
    days,
    open_count: openItems.length,
    counts_by_priority: countBy('priority'),
    counts_by_category: countBy('category'),
    counts_by_impact_area: countBy('impact_area'),
    top_items: openItems.slice(0, 25).map((item) => ({
      fingerprint: item.fingerprint,
      id: item.id,
      priority: item.priority,
      category: item.category,
      impact_area: item.impact_area,
      title: item.title,
      observation: item.observation,
      impact_on_goal: item.impact_on_goal,
      suggested_fix: item.suggested_fix,
      occurrence_count: item.occurrence_count,
      first_seen_at: item.first_seen_at,
      last_seen_at: item.last_seen_at,
      evidence: item.evidence,
      artifact_paths: item.artifact_paths,
      platform_refs: item.platform_refs,
      score: itemScore(item),
    })),
    log_path: logPath(resolvedStateDir),
    index_path: indexPath(resolvedStateDir),
  };
}

function resolveItem({ fingerprint, resolutionNote, stateDir = DEFAULT_STATE_DIR, now = new Date() }) {
  const resolvedStateDir = resolve(stateDir);
  ensureState(resolvedStateDir);
  const index = readIndex(resolvedStateDir);
  const item = index.items[normalizeString(fingerprint)];
  if (!item) throw new Error('fingerprint not found.');
  item.status = 'resolved';
  item.resolved_at = now.toISOString();
  item.resolution_note = normalizeString(resolutionNote) || null;
  writeJsonAtomic(indexPath(resolvedStateDir), index);
  appendJsonl(logPath(resolvedStateDir), {
    version: 1,
    event: 'resolved',
    id: randomUUID(),
    fingerprint: item.fingerprint,
    resolved_at: item.resolved_at,
    resolution_note: item.resolution_note,
  });
  return {
    ok: true,
    decision: 'resolved',
    fingerprint: item.fingerprint,
    index_path: indexPath(resolvedStateDir),
  };
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-/g, '_');
    const next = argv[index + 1];
    if (next == null || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/gtm-improvement-log.mjs add --payload-file note.json
  node scripts/gtm-improvement-log.mjs report [--days 90]
  node scripts/gtm-improvement-log.mjs resolve --fingerprint <fingerprint> --resolution-note "fixed in PR ..."

Required add payload fields:
  source_automation, category, priority, impact_area, confidence: "high",
  title, observation, impact_on_goal, suggested_fix

Only record obvious bugs or obvious improvements that can materially improve autonomous interested-lead generation.`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const stateDir = args.state_dir ?? DEFAULT_STATE_DIR;

  if (!command || args.help) {
    console.log(usage());
    return;
  }

  if (command === 'add') {
    if (!args.payload_file) throw new Error('--payload-file is required.');
    const payload = JSON.parse(readFileSync(args.payload_file, 'utf8'));
    console.log(JSON.stringify(add({ payload, stateDir }), null, 2));
    return;
  }

  if (command === 'report') {
    const days = args.days ? Number(args.days) : 90;
    if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number.');
    console.log(JSON.stringify(report({ stateDir, days }), null, 2));
    return;
  }

  if (command === 'resolve') {
    if (!args.fingerprint) throw new Error('--fingerprint is required.');
    console.log(JSON.stringify(resolveItem({
      fingerprint: args.fingerprint,
      resolutionNote: args.resolution_note,
      stateDir,
    }), null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  }
}

export const __test__ = {
  add,
  normalizeNote,
  report,
  resolveItem,
};
