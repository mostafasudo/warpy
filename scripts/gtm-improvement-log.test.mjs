import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { __test__ } from './gtm-improvement-log.mjs';

function tempState() {
  const stateDir = mkdtempSync(join(tmpdir(), 'gtm-improvement-log-'));
  return {
    stateDir,
    cleanup: () => rmSync(stateDir, { recursive: true, force: true }),
  };
}

const basePayload = {
  source_automation: 'warpy-gtm-task-executor',
  run_id: '2026-05-15T10:00:00Z',
  category: 'bug',
  priority: 'p2',
  impact_area: 'autonomy',
  confidence: 'high',
  title: 'Apollo completion retry failed after successful send',
  observation: 'A recipient-visible email was sent, but Apollo completion failed twice for the same task.',
  impact_on_goal: 'Completion drift leaves safe work stuck and can make later autonomous task runs spend time on stale work instead of interested-lead generation.',
  suggested_fix: 'Add a targeted completion-only retry path that bypasses copy validation but cannot send a second message.',
  evidence: ['task 123 completion_pending in task-action-ledger.jsonl'],
  artifact_paths: ['/Users/levw/.codex/state/warpy-gtm/task-executor-runs/example.json'],
};

test('add records a high-confidence improvement note and report returns it', () => {
  const state = tempState();
  try {
    const result = __test__.add({
      stateDir: state.stateDir,
      payload: basePayload,
      now: new Date('2026-05-15T10:00:00Z'),
    });

    assert.equal(result.decision, 'recorded');
    assert.ok(result.fingerprint);

    const report = __test__.report({
      stateDir: state.stateDir,
      now: new Date('2026-05-15T10:05:00Z'),
    });

    assert.equal(report.open_count, 1);
    assert.equal(report.counts_by_priority.p2, 1);
    assert.equal(report.top_items[0].title, basePayload.title);
    assert.equal(report.top_items[0].occurrence_count, 1);
  } finally {
    state.cleanup();
  }
});

test('add dedupes repeated open notes and tracks occurrences', () => {
  const state = tempState();
  try {
    const first = __test__.add({
      stateDir: state.stateDir,
      payload: basePayload,
      now: new Date('2026-05-15T10:00:00Z'),
    });
    const second = __test__.add({
      stateDir: state.stateDir,
      payload: { ...basePayload, run_id: '2026-05-15T12:00:00Z', evidence: ['same failure in later run'] },
      now: new Date('2026-05-15T12:00:00Z'),
    });

    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(second.decision, 'deduped');
    assert.equal(second.occurrence_count, 2);

    const report = __test__.report({
      stateDir: state.stateDir,
      now: new Date('2026-05-15T12:05:00Z'),
    });

    assert.equal(report.open_count, 1);
    assert.equal(report.top_items[0].occurrence_count, 2);

    const logLines = readFileSync(join(state.stateDir, 'improvement-log.jsonl'), 'utf8').trim().split('\n');
    assert.equal(logLines.length, 2);
    assert.equal(JSON.parse(logLines[1]).event, 'observed_again');
  } finally {
    state.cleanup();
  }
});

test('add rejects non-obvious or underspecified notes', () => {
  const state = tempState();
  try {
    assert.throws(
      () => __test__.add({
        stateDir: state.stateDir,
        payload: { ...basePayload, confidence: 'medium' },
      }),
      /confidence must be high/,
    );

    assert.throws(
      () => __test__.add({
        stateDir: state.stateDir,
        payload: { ...basePayload, impact_area: 'nice_to_have' },
      }),
      /impact_area must be one of/,
    );
  } finally {
    state.cleanup();
  }
});

test('resolve removes an item from open report', () => {
  const state = tempState();
  try {
    const added = __test__.add({
      stateDir: state.stateDir,
      payload: basePayload,
      now: new Date('2026-05-15T10:00:00Z'),
    });

    const resolved = __test__.resolveItem({
      stateDir: state.stateDir,
      fingerprint: added.fingerprint,
      resolutionNote: 'fixed retry path',
      now: new Date('2026-05-15T11:00:00Z'),
    });

    assert.equal(resolved.decision, 'resolved');

    const report = __test__.report({
      stateDir: state.stateDir,
      now: new Date('2026-05-15T12:00:00Z'),
    });
    assert.equal(report.open_count, 0);
  } finally {
    state.cleanup();
  }
});
