#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BLOCKING_STATUSES = new Set(['claimed', 'sent', 'completion_pending', 'completed']);
const MARK_STATUSES = new Set([...BLOCKING_STATUSES, 'void']);
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
const NO_COPY_MODES = new Set(['linkedin_like_only', 'blank_connection_request']);
const MESSAGE_FAMILIES = new Set(['email', 'linkedin_dm', 'x_touch', 'other_outbound']);
const UNRESOLVED_PLACEHOLDER_PATTERN = /(\[(?:first name|last name|trigger|company|company name|title|persona|pain|proof|workflow|observation)\]|\{\{\s*[^}]+\s*\}\})/i;
const INTERNAL_SOURCE_LABEL_PATTERN = /\b(?:apollo profile|amplemarket|structured amplemarket|duo crow competitor|duo saas event|duo copilot|crow competitor)\b/i;
const INSIDER_WARPY_POSITIONING_PATTERNS = [
  /\bapproved\s+(?:step|steps|action|actions|workflow|workflows)\b/i,
  /\busing\s+only\s+approved\s+actions\b/i,
  /\bseparate\s+bot\b/i,
  /\bgeneric\s+chatbot\b/i,
  /\binteresting\s+bit\b/i,
  /\bnot\s+just\s+answers\b/i,
];
const STATIC_TEMPLATE_PHRASE_SETS = [
  [
    'in complex dashboards most users only use a small slice',
    'dashboard filter navigate and finish the workflow',
    'want me to send a quick breakdown',
  ],
  [
    'this usually shows up in one of 3 ways',
    'users only use a small slice of the product',
    'new users stall before value',
  ],
  [
    'one concrete example',
    'a user types what they need in plain english',
    'want me to map one workflow',
  ],
  [
    'the fastest places to test something like this are usually the same 3',
    'features users rarely find on their own',
    'repeat how do i do this questions',
  ],
  [
    'seems like this is either not a priority right now or i missed the mark',
    'if helping more users get more out of',
    'happy to send over a quick breakdown',
  ],
  [
    'thanks for connecting noticed',
    'happy to send a quick breakdown of where chat could help users do more in',
    'dashboard if useful',
  ],
  [
    'noticed a pattern in complex b2b dashboards',
    'users still miss key workflows and support keeps getting the same how do i do this tickets',
    'warpy adds an in product ai assistant so users can ask for help in plain english',
  ],
  [
    'when users cannot find the right feature or workflow',
    'low adoption slow onboarding and more support tickets',
    'making the existing dashboard ai native',
  ],
  [
    'thanks for connecting i keep seeing the same thing in complex b2b dashboards',
    'users miss deep features then support gets the how do i do this tickets',
    'in product ai assistant could help if useful',
  ],
  [
    'a user asks the app to do the job in plain english',
    'opens the right view and shows the next fields or options',
    'lift feature adoption and cut repetitive support tickets',
  ],
  [
    'best places to test an in product ai assistant are usually',
    'setup or reporting flows that create support tickets',
    'users know the job but not the path through the dashboard',
  ],
  [
    'complex dashboards often have the same hidden cost',
    'users only adopt a slice of the product',
    'making the app feel ai native through chat and screen autopilot',
  ],
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeToken(value) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeCopy(value) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function copyValueToText(value) {
  const parsed = parseMaybeJson(value);
  if (parsed == null) return '';
  if (typeof parsed === 'string') return parsed;
  if (typeof parsed === 'object') {
    const parts = [
      parsed.subject,
      parsed.body,
      parsed.message,
      parsed.copy,
      parsed.text,
      parsed.note,
    ].map(copyValueToText).filter(Boolean);
    if (parts.length > 0) return parts.join('\n');
    return JSON.stringify(parsed);
  }
  return String(parsed);
}

function collectEvidenceValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(collectEvidenceValues);
  if (typeof value !== 'object') return [value];
  const ignoredEvidenceKeys = new Set([
    'core_idea',
    'persona_angle',
    'proof_workflow',
    'proof_point',
    'subject',
    'body',
    'message',
    'copy',
    'text',
    'note',
    'channel',
    'sequence_step',
    'copy_status',
    'copy_source',
    'customer_problem',
    'generated_at',
    'fresh_until',
    'recipient_safe_warpy_bridge',
  ]);
  return [
    value.personalization_evidence,
    value.lead_specific_observation,
    value.trigger,
    value.evidence_references,
    ...Object.entries(value)
      .filter(([key]) => !ignoredEvidenceKeys.has(key))
      .flatMap(([, nestedValue]) => collectEvidenceValues(nestedValue)),
  ].flatMap(collectEvidenceValues);
}

function extractCopyParts(payload) {
  const parsedCopyFields = [
    payload.copy_payload,
    payload.exact_copy,
    payload.copy_used,
    payload.planned_copy,
    payload.intended_copy,
    payload.copy,
  ].map(parseMaybeJson);

  const subject = normalizeString(
    payload.subject ??
      payload.email_subject ??
      payload.subject_line ??
      parsedCopyFields.find((value) => value && typeof value === 'object' && normalizeString(value.subject))?.subject ??
      '',
  );

  const body = [
    payload.body,
    payload.email_body,
    payload.message,
    payload.linkedin_message,
    payload.connection_note,
    ...parsedCopyFields.map((value) => (value && typeof value === 'object' ? value.body ?? value.message ?? value.copy ?? value.text : value)),
  ].map(copyValueToText).filter(Boolean).join('\n').trim();

  return { subject, body, combined: [subject, body].filter(Boolean).join('\n') };
}

function extractPersonalizationEvidence(payload) {
  const packet = payload.personalization_packet && typeof payload.personalization_packet === 'object'
    ? payload.personalization_packet
    : {};
  const evidence = [
    payload.personalization_evidence,
    payload.lead_specific_observation,
    payload.trigger,
    payload.duo_trigger_summary,
    packet.lead_specific_observation,
    Array.isArray(packet.evidence_references) ? packet.evidence_references.join(' ') : packet.evidence_references,
    ...collectEvidenceValues(packet.steps),
  ].map(copyValueToText).filter((value) => normalizeString(value).length >= 12);

  return evidence;
}

function hasStaticTemplateCopy(copy) {
  const normalized = normalizeCopy(copy);
  if (!normalized) return false;
  return STATIC_TEMPLATE_PHRASE_SETS.some((phrases) => phrases.every((phrase) => normalized.includes(phrase)));
}

function hasInsiderWarpyPositioning(copy) {
  return INSIDER_WARPY_POSITIONING_PATTERNS.some((pattern) => pattern.test(copy));
}

function validateCopyQuality(payload, keyInfo) {
  const family = keyInfo?.family ?? normalizeActionFamily(payload);
  if (!isOutboundFamily(family)) return null;

  const noCopyMode = normalizeToken(payload.no_copy_mode).replace(/-/g, '_');
  if (noCopyMode) {
    if (!NO_COPY_MODES.has(noCopyMode)) {
      return { reason: 'unsupported_no_copy_mode', details: { no_copy_mode: noCopyMode } };
    }
    if (noCopyMode === 'blank_connection_request' && family === 'connection_request') return null;
    if (noCopyMode === 'linkedin_like_only' && family === 'public_social_touch') return null;
    return { reason: 'no_copy_mode_channel_mismatch', details: { no_copy_mode: noCopyMode, family } };
  }

  const { subject, body, combined } = extractCopyParts(payload);
  const isMessageBearing = MESSAGE_FAMILIES.has(family) || family === 'connection_request' || family === 'public_social_touch';
  if (!isMessageBearing) return null;

  if (family === 'email' && (!subject || !body)) {
    return { reason: 'missing_email_subject_or_body', details: { has_subject: Boolean(subject), has_body: Boolean(body) } };
  }

  if (family !== 'email' && !body) {
    return { reason: 'missing_message_body', details: { family } };
  }

  if (UNRESOLVED_PLACEHOLDER_PATTERN.test(combined)) {
    return { reason: 'unresolved_copy_placeholder' };
  }

  if (INTERNAL_SOURCE_LABEL_PATTERN.test(combined)) {
    return { reason: 'internal_source_label_in_copy' };
  }

  if (hasStaticTemplateCopy(combined)) {
    return { reason: 'static_apollo_template_copy' };
  }

  if (hasInsiderWarpyPositioning(combined)) {
    return { reason: 'insider_warpy_positioning_in_copy' };
  }

  if (extractPersonalizationEvidence(payload).length === 0) {
    return { reason: 'missing_personalization_evidence' };
  }

  return null;
}

function auditCopyQuality(record) {
  const { combined } = extractCopyParts(record);
  if (!combined) return null;
  if (UNRESOLVED_PLACEHOLDER_PATTERN.test(combined)) return { reason: 'unresolved_copy_placeholder' };
  if (INTERNAL_SOURCE_LABEL_PATTERN.test(combined)) return { reason: 'internal_source_label_in_copy' };
  if (hasStaticTemplateCopy(combined)) return { reason: 'static_apollo_template_copy' };
  if (hasInsiderWarpyPositioning(combined)) return { reason: 'insider_warpy_positioning_in_copy' };
  return null;
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
    if (!BLOCKING_STATUSES.has(record.status)) return;

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
    if (!BLOCKING_STATUSES.has(claim.status)) continue;
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
  const pathsToReplace = [];

  for (const key of keyInfo.keys) {
    const path = claimFilePath(stateDir, key.key);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, 'utf8'));
      if (BLOCKING_STATUSES.has(existing.status)) {
        return {
          ok: false,
          decision: 'blocked',
          reason: key.reason,
          conflict_key: key.key,
          completion_retry_allowed: false,
        };
      }
      pathsToReplace.push(path);
    }
  }

  for (const path of pathsToReplace) rmSync(path, { force: true });

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

  const copyQualityIssue = validateCopyQuality(payload, keyInfo);
  if (copyQualityIssue) {
    return {
      ok: false,
      decision: 'blocked',
      reason: copyQualityIssue.reason,
      completion_retry_allowed: false,
      copy_quality_details: copyQualityIssue.details ?? null,
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

function validateMarkPayload(payload, status) {
  if (status !== 'void') return;
  if (!normalizeString(payload.no_send_reason)) {
    throw new Error('void guard marks require no_send_reason.');
  }
  if (payload.sent_at || payload.apollo_completed_at) {
    throw new Error('void guard marks cannot include sent_at or apollo_completed_at.');
  }
}

function mark({ payload, stateDir, status }) {
  if (!MARK_STATUSES.has(status)) {
    throw new Error(`Unsupported guard mark status: ${status}`);
  }
  validateMarkPayload(payload, status);

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
    if (status === 'void') {
      current.voided_at = updatedAt;
      current.no_send_reason = payload.no_send_reason;
      current.platform_url = payload.platform_url ?? current.platform_url ?? null;
    }
    writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
    updated.push(key.key);
  }

  return { ok: true, decision: 'marked', status, guard_claim_keys: updated };
}

function audit({ ledgerPath }) {
  const records = readJsonl(ledgerPath);
  const sentRecords = records.filter((record) => record.status === 'sent');
  const terminalMessageRecords = records.filter((record) => ['sent', 'completed', 'completion_pending'].includes(record.status));
  const sentByTask = new Map();
  const sentByDirectRecipientDay = new Map();
  const copyQualityIssues = [];
  const copyQualityIssueCounts = {};
  let replayBlocked = 0;
  const replayKeys = new Set();

  for (const record of terminalMessageRecords) {
    const issue = auditCopyQuality(record);
    if (!issue) continue;
    copyQualityIssueCounts[issue.reason] = (copyQualityIssueCounts[issue.reason] ?? 0) + 1;
    copyQualityIssues.push({
      reason: issue.reason,
      status: record.status ?? null,
      apollo_task_id: record.apollo_task_id ?? null,
      action_key: record.action_key ?? null,
      channel: record.channel ?? null,
      step_type: record.step_type ?? null,
      contact_email: record.contact_email ?? null,
      sent_at: record.sent_at ?? null,
      apollo_completed_at: record.apollo_completed_at ?? null,
    });
  }

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
    copy_quality_issue_records: copyQualityIssues.length,
    copy_quality_issue_counts: copyQualityIssueCounts,
    replay_sends_that_guard_would_block: replayBlocked,
    duplicate_tasks: duplicateTasks,
    duplicate_direct_recipients: duplicateDirectRecipients,
    copy_quality_issues: copyQualityIssues,
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
  node scripts/gtm-task-guard.mjs mark --status void --payload-file task.json
  node scripts/gtm-task-guard.mjs rebuild-index
  node scripts/gtm-task-guard.mjs audit

Payloads must include apollo_task_id, run_started_at, local_date, and a recipient identifier such as contact_email or linkedin_url.
Message-bearing payloads must include final copy fields such as subject/body, message, copy_used, exact_copy, or personalization_packet evidence.
Use no_copy_mode only for linkedin_like_only or blank_connection_request.
Use mark --status void only for verified no-send aborts, and include no_send_reason.`;
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
  extractCopyParts,
  mark,
  normalizeActionFamily,
  normalizeLocalDate,
  normalizeRecipient,
  normalizeRecipients,
  parseArgs,
  rebuildIndex,
  validateCopyQuality,
};
