import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { __test__ } from './gtm-automation-run-guard.mjs';

function tempState() {
  const stateDir = mkdtempSync(join(tmpdir(), 'gtm-automation-run-guard-'));
  return {
    stateDir,
    cleanup: () => rmSync(stateDir, { recursive: true, force: true }),
  };
}

test('first claim succeeds and second same-automation claim blocks', () => {
  const state = tempState();
  try {
    const first = __test__.claim({
      automationId: 'warpy-gtm-task-executor',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
      nowMs: 1000,
    });

    const second = __test__.claim({
      automationId: 'warpy-gtm-task-executor',
      stateDir: state.stateDir,
      ownerToken: 'owner-2',
      nowMs: 2000,
    });

    assert.equal(first.decision, 'claimed');
    assert.equal(first.owner_token, 'owner-1');
    assert.equal(second.decision, 'blocked');
    assert.equal(second.reason, 'active_run_exists');
    assert.equal(second.active_owner.owner_token, 'owner-1');
  } finally {
    state.cleanup();
  }
});

test('release with correct token frees the lock', () => {
  const state = tempState();
  try {
    __test__.claim({
      automationId: 'warpy-marketing-engine',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
      nowMs: 1000,
    });

    const released = __test__.release({
      automationId: 'warpy-marketing-engine',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
    });

    const next = __test__.claim({
      automationId: 'warpy-marketing-engine',
      stateDir: state.stateDir,
      ownerToken: 'owner-2',
      nowMs: 2000,
    });

    assert.equal(released.decision, 'released');
    assert.equal(next.decision, 'claimed');
    assert.equal(next.owner_token, 'owner-2');
  } finally {
    state.cleanup();
  }
});

test('release with wrong token fails and keeps the older lock', () => {
  const state = tempState();
  try {
    __test__.claim({
      automationId: 'warpy-gtm-lead-builder',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
      nowMs: 1000,
    });

    const release = __test__.release({
      automationId: 'warpy-gtm-lead-builder',
      stateDir: state.stateDir,
      ownerToken: 'owner-2',
    });
    const next = __test__.claim({
      automationId: 'warpy-gtm-lead-builder',
      stateDir: state.stateDir,
      ownerToken: 'owner-3',
      nowMs: 2000,
    });

    assert.equal(release.decision, 'release_denied');
    assert.equal(release.reason, 'owner_token_mismatch');
    assert.equal(next.decision, 'blocked');
    assert.equal(next.active_owner.owner_token, 'owner-1');
  } finally {
    state.cleanup();
  }
});

test('stale abandoned lock is reclaimed by a newer run', () => {
  const state = tempState();
  try {
    __test__.claim({
      automationId: 'warpy-gtm-task-executor',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
      staleAfterMs: 10,
      nowMs: 1000,
    });

    const next = __test__.claim({
      automationId: 'warpy-gtm-task-executor',
      stateDir: state.stateDir,
      ownerToken: 'owner-2',
      staleAfterMs: 10,
      nowMs: 1010,
    });
    const oldRelease = __test__.release({
      automationId: 'warpy-gtm-task-executor',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
    });

    assert.equal(next.decision, 'claimed');
    assert.equal(next.reclaimed, true);
    assert.equal(next.previous_owner.owner_token, 'owner-1');
    assert.equal(next.owner_token, 'owner-2');
    assert.equal(oldRelease.decision, 'release_denied');
  } finally {
    state.cleanup();
  }
});

test('different automation ids do not block each other', () => {
  const state = tempState();
  try {
    const first = __test__.claim({
      automationId: 'warpy-marketing-engine',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
      nowMs: 1000,
    });
    const second = __test__.claim({
      automationId: 'warpy-gtm-lead-builder',
      stateDir: state.stateDir,
      ownerToken: 'owner-2',
      nowMs: 1000,
    });

    assert.equal(first.decision, 'claimed');
    assert.equal(second.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('status reports active lock and stale state', () => {
  const state = tempState();
  try {
    __test__.claim({
      automationId: 'warpy-marketing-engine',
      stateDir: state.stateDir,
      ownerToken: 'owner-1',
      staleAfterMs: 10,
      nowMs: 1000,
    });

    const active = __test__.status({
      automationId: 'warpy-marketing-engine',
      stateDir: state.stateDir,
      staleAfterMs: 10,
      nowMs: 1009,
    });
    const stale = __test__.status({
      automationId: 'warpy-marketing-engine',
      stateDir: state.stateDir,
      staleAfterMs: 10,
      nowMs: 1010,
    });

    assert.equal(active.decision, 'active');
    assert.equal(active.stale, false);
    assert.equal(stale.decision, 'active');
    assert.equal(stale.stale, true);
  } finally {
    state.cleanup();
  }
});
