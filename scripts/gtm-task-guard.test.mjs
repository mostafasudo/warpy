import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { __test__ } from './gtm-task-guard.mjs';

function tempState() {
  const stateDir = mkdtempSync(join(tmpdir(), 'gtm-task-guard-'));
  return {
    stateDir,
    ledgerPath: join(stateDir, 'task-action-ledger.jsonl'),
    cleanup: () => rmSync(stateDir, { recursive: true, force: true }),
  };
}

function writeLedger(ledgerPath, records) {
  writeFileSync(ledgerPath, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
}

const basePayload = {
  apollo_task_id: 'task-1',
  channel: 'email',
  step_type: 'manual_email',
  contact_email: 'Lead@Example.com',
  run_started_at: '2026-04-30T10:00:00Z',
  local_date: '2026-04-30',
  copy_hash: 'copy-a',
};

test('copy_hash changes do not allow a same-task resend', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      { ...basePayload, status: 'sent', sent_at: '2026-04-30T10:01:00Z', copy_hash: 'copy-a' },
    ]);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: { ...basePayload, copy_hash: 'copy-b' },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'apollo_task_already_touched');
  } finally {
    state.cleanup();
  }
});

test('email and apollo_email normalize to the same direct recipient guard', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      { ...basePayload, channel: 'apollo_email', status: 'sent', sent_at: '2026-04-30T10:01:00Z' },
    ]);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: { ...basePayload, apollo_task_id: 'task-2', channel: 'email' },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'same_run_recipient_already_touched');
  } finally {
    state.cleanup();
  }
});

test('trailing-slash LinkedIn URLs normalize to one recipient', () => {
  assert.equal(
    __test__.normalizeRecipient({ linkedin_url: 'https://www.linkedin.com/in/NoahLucas/' }),
    'linkedin:linkedin.com/in/noahlucas',
  );
  assert.equal(
    __test__.normalizeRecipient({ linkedin_url: 'linkedin.com/in/noahlucas' }),
    'linkedin:linkedin.com/in/noahlucas',
  );
});

test('email and X URL normalization handle common copied formats', () => {
  assert.equal(
    __test__.normalizeRecipient({ contact_email: 'Noah Lucas <NOAH@SIFTSTACK.COM>,' }),
    'email:noah@siftstack.com',
  );
  assert.equal(
    __test__.normalizeRecipient({ x_url: 'https://twitter.com/@NoahLucas?ref=profile' }),
    'x:x.com/noahlucas',
  );
});

test('LinkedIn message and InMail labels normalize to linkedin_dm', () => {
  assert.equal(__test__.normalizeActionFamily({ channel: 'linkedin', step_type: 'Step 7 LinkedIn: Send Message' }), 'linkedin_dm');
  assert.equal(__test__.normalizeActionFamily({ channel: 'linkedin', step_type: 'inmail followup' }), 'linkedin_dm');
});

test('all available recipient aliases are claimed and can block later payload variants', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      {
        apollo_task_id: 'linkedin-only-task',
        channel: 'linkedin',
        step_type: 'connection_request',
        linkedin_url: 'https://www.linkedin.com/in/noahlucas/',
        status: 'sent',
        sent_at: '2026-04-30T10:01:00Z',
        run_started_at: '2026-04-30T10:00:00Z',
      },
    ]);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'different-task',
        channel: 'linkedin',
        step_type: 'connection_request',
        contact_email: 'noah@siftstack.com',
        linkedin_url: 'https://linkedin.com/in/noahlucas',
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'same_run_recipient_already_touched');
    assert.equal(result.conflict_key, 'recipient-run:2026-04-30T10:00:00Z:linkedin:linkedin.com/in/noahlucas');
  } finally {
    state.cleanup();
  }
});

test('claim requires local_date instead of falling back to UTC today', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);
    assert.throws(
      () => __test__.claim({
        stateDir: state.stateDir,
        ledgerPath: state.ledgerPath,
        payload: { ...basePayload, local_date: undefined },
      }),
      /requires local_date/,
    );
  } finally {
    state.cleanup();
  }
});

test('completion_pending blocks sends but allows completion-only retry', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      { ...basePayload, status: 'completion_pending', sent_at: '2026-04-30T10:01:00Z' },
    ]);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: basePayload,
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'completion_pending_completion_only');
    assert.equal(result.completion_retry_allowed, true);
  } finally {
    state.cleanup();
  }
});

test('missing legacy action_key does not bypass task and recipient locks', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      {
        apollo_task_id: 'legacy-task',
        channel: 'email',
        step_type: 'manual_email',
        contact_email: 'legacy@example.com',
        status: 'sent',
        sent_at: '2026-04-30T11:00:00Z',
      },
    ]);

    const taskResult = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'legacy-task',
        contact_email: 'other@example.com',
      },
    });
    assert.equal(taskResult.reason, 'apollo_task_already_touched');

    const recipientResult = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'new-task',
        contact_email: 'legacy@example.com',
        run_started_at: '2026-04-30T11:00:00Z',
      },
    });
    assert.equal(recipientResult.reason, 'same_day_direct_recipient_already_touched');
  } finally {
    state.cleanup();
  }
});

test('stale persisted index is ignored when the active ledger path changes', () => {
  const state = tempState();
  const secondLedgerPath = join(state.stateDir, 'other-ledger.jsonl');
  try {
    writeLedger(state.ledgerPath, [
      { ...basePayload, status: 'sent', sent_at: '2026-04-30T10:01:00Z' },
    ]);
    __test__.rebuildIndex({ stateDir: state.stateDir, ledgerPath: state.ledgerPath });
    writeLedger(secondLedgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: secondLedgerPath,
      payload: basePayload,
    });

    assert.equal(result.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('same recipient in the same run is blocked after a claim', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);
    const first = __test__.claim({ stateDir: state.stateDir, ledgerPath: state.ledgerPath, payload: basePayload });
    assert.equal(first.decision, 'claimed');

    const second = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: { ...basePayload, apollo_task_id: 'task-2', step_type: 'linkedin_dm', channel: 'linkedin' },
    });

    assert.equal(second.decision, 'blocked');
    assert.equal(second.reason, 'same_run_recipient_already_touched');
  } finally {
    state.cleanup();
  }
});

test('same-day email and LinkedIn DM collision is blocked across runs', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      { ...basePayload, status: 'sent', sent_at: '2026-04-30T10:01:00Z' },
    ]);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'task-2',
        channel: 'linkedin',
        step_type: 'linkedin_dm',
        run_started_at: '2026-04-30T12:00:00Z',
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'same_day_direct_recipient_already_touched');
  } finally {
    state.cleanup();
  }
});

test('audit groups direct-message duplicates across recipient aliases', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      {
        apollo_task_id: 'dm-1',
        channel: 'linkedin',
        step_type: 'linkedin_dm',
        linkedin_url: 'https://www.linkedin.com/in/noahlucas/',
        status: 'sent',
        sent_at: '2026-04-30T10:01:00Z',
      },
      {
        apollo_task_id: 'dm-2',
        channel: 'linkedin',
        step_type: 'send message',
        contact_email: 'noah@siftstack.com',
        linkedin_url: 'https://linkedin.com/in/noahlucas',
        status: 'sent',
        sent_at: '2026-04-30T12:01:00Z',
      },
    ]);

    const result = __test__.audit({ ledgerPath: state.ledgerPath });
    assert.equal(result.duplicate_direct_recipient_day_groups, 1);
    assert.equal(result.duplicate_direct_recipients[0].recipient_day, '2026-04-30:linkedin:linkedin.com/in/noahlucas:direct_message');
  } finally {
    state.cleanup();
  }
});

test('audit tolerates a partially written final JSONL line', () => {
  const state = tempState();
  try {
    writeFileSync(state.ledgerPath, `${JSON.stringify({ ...basePayload, status: 'sent', sent_at: '2026-04-30T10:01:00Z' })}\n{"partial"`);
    const result = __test__.audit({ ledgerPath: state.ledgerPath });
    assert.equal(result.sent_records, 1);
  } finally {
    state.cleanup();
  }
});

test('global help is parsed before command validation', () => {
  const result = __test__.parseArgs(['--help']);
  assert.equal(result.help, true);
  assert.equal(result.command, null);
});

test('audit reports duplicate task sends in ledger order', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      { ...basePayload, status: 'sent', sent_at: '2026-04-30T10:01:00Z' },
      { ...basePayload, status: 'sent', sent_at: '2026-04-30T10:02:00Z', copy_hash: 'copy-b' },
    ]);

    const result = __test__.audit({ ledgerPath: state.ledgerPath });
    assert.equal(result.duplicate_task_groups, 1);
    assert.equal(result.replay_sends_that_guard_would_block, 1);
  } finally {
    state.cleanup();
  }
});
