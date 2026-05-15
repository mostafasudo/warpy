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
  subject: 'workflow depth',
  body: 'noah - noticed sift is pushing telemetry workflows for hardware teams.\n\nthat seems like a dashboard where the next action matters as much as the answer.\n\nworth a quick breakdown for sift?',
  lead_specific_observation: 'Sift is pushing telemetry workflows for hardware teams.',
};

const validDuoPayload = {
  ...basePayload,
  contact_email: 'dbapna@arkieva.com',
  subject: 'quick breakdown',
  body: 'deepak - noticed the crow signal around ai help inside complex products.\n\nsupply-chain planning feels like a strong version of that problem. there is a lot of dashboard depth, and users only get value when they can move from question to action quickly.\n\nwarpy lets teams add a plain-english action layer that inherits the existing product ui and only uses approved actions.\n\nworth a quick breakdown for arkieva?',
  personalization_packet: {
    core_idea: 'dashboard users should move from question to approved action inside the existing product',
    lead_specific_observation: 'Duo surfaced Crow competitor engagement from Arkieva CPO Deepak Bapna.',
    persona_angle: 'product adoption for supply-chain planning workflows',
    proof_workflow: 'plain-english action layer inside the existing Arkieva dashboard',
    copy_source: 'duo_rewritten',
  },
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

test('claim blocks unresolved placeholders before writing recipient locks', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        body: '[First name] - noticed [trigger].\n\nwant me to send a quick breakdown for [Company]?',
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'unresolved_copy_placeholder');
  } finally {
    state.cleanup();
  }
});

test('claim blocks static Apollo template copy even when placeholders are absent', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        body: 'victor - noticed your product.\n\nin complex dashboards, most users only use a small slice because they dont know what to do next or where to go.\n\nwarpy lets them ask in plain english and have the dashboard filter, navigate, and take the next approved action right there.\n\nwant me to send a quick breakdown for tonkean?',
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'static_apollo_template_copy');
  } finally {
    state.cleanup();
  }
});

test('claim blocks static Apollo LinkedIn DM copy after placeholders are replaced', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'static-linkedin-dm',
        channel: 'linkedin',
        step_type: 'linkedin_dm',
        subject: '',
        body: "thanks for connecting. noticed acme launched reporting. happy to send a quick breakdown of where chat could help users do more in Acme's dashboard if useful",
        lead_specific_observation: 'Acme launched reporting for dashboard users.',
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'static_apollo_template_copy');
  } finally {
    state.cleanup();
  }
});

test('claim blocks current Apollo scaffold copy even without placeholders', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'current-static-scaffold',
        subject: 'quick breakdown',
        body: 'noticed a pattern in complex b2b dashboards.\n\nteams ship a lot of useful product depth, but users still miss key workflows and support keeps getting the same how do i do this tickets.\n\nwarpy adds an in-product ai assistant that lets users control the app through chat and dynamic ui, using only approved actions.\n\nworth sending a quick breakdown of where this could fit?',
        lead_specific_observation: 'Acme has a complex dashboard.',
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'static_apollo_template_copy');
  } finally {
    state.cleanup();
  }
});

test('claim blocks internal source labels in recipient-visible copy', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'internal-source-label',
        body: 'deepak - noticed Duo Crow competitor engagement by CPO at a workflow-heavy planning software company.\n\nworth a quick breakdown for arkieva?',
        lead_specific_observation: 'Arkieva is a workflow-heavy planning software company.',
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'internal_source_label_in_copy');
  } finally {
    state.cleanup();
  }
});

test('claim blocks manual email without subject or body', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const noSubject = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: { ...basePayload, apollo_task_id: 'missing-subject', subject: '' },
    });
    assert.equal(noSubject.decision, 'blocked');
    assert.equal(noSubject.reason, 'missing_email_subject_or_body');

    const noBody = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: { ...basePayload, apollo_task_id: 'missing-body', body: '' },
    });
    assert.equal(noBody.decision, 'blocked');
    assert.equal(noBody.reason, 'missing_email_subject_or_body');
  } finally {
    state.cleanup();
  }
});

test('claim accepts Duo-rewritten personalized copy with packet evidence', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: validDuoPayload,
    });

    assert.equal(result.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('claim accepts non-Duo researched personalized copy', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'researched-task',
        contact_email: 'ryan@upkeep.com',
        subject: 'upkeep workflows',
        body: 'ryan - noticed upkeep has a lot of operational workflow depth for maintenance teams.\n\nthat seems like the kind of dashboard where users know the job they need done, but not always the exact path to get there.\n\nworth a quick breakdown for upkeep?',
        personalization_packet: {
          core_idea: 'help dashboard users get from intent to approved workflow action',
          lead_specific_observation: 'UpKeep positions around maintenance workflow depth for operations teams.',
          persona_angle: 'product adoption in operational dashboards',
          proof_workflow: 'request work order updates in plain english and complete approved actions in the existing UI',
          copy_source: 'research_generated',
        },
      },
    });

    assert.equal(result.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('claim accepts packet step-level personalization evidence', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'step-evidence',
        lead_specific_observation: '',
        personalization_packet: {
          core_idea: 'help users get more done inside complex dashboards',
          steps: {
            email_1: {
              personalization_evidence: 'Tracksuit recently expanded reporting workflows for brand tracking teams.',
            },
          },
        },
      },
    });

    assert.equal(result.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('claim does not treat personalization_packet core_idea as evidence', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'generic-core-idea',
        lead_specific_observation: '',
        personalization_packet: {
          core_idea: 'help users get more done inside complex dashboards',
        },
      },
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'missing_personalization_evidence');
  } finally {
    state.cleanup();
  }
});

test('claim treats copy_mode as metadata, not a no-copy override', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'copy-mode-generated',
        copy_mode: 'generated',
      },
    });

    assert.equal(result.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('claim accepts explicit blank LinkedIn connection requests', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'connect-task',
        channel: 'linkedin',
        step_type: 'connection_request',
        subject: '',
        body: '',
        no_copy_mode: 'blank_connection_request',
      },
    });

    assert.equal(result.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('claim accepts explicit LinkedIn like-only touches', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'like-task',
        channel: 'linkedin',
        step_type: 'post_interaction',
        subject: '',
        body: '',
        no_copy_mode: 'linkedin_like_only',
      },
    });

    assert.equal(result.decision, 'claimed');
  } finally {
    state.cleanup();
  }
});

test('claim blocks message-bearing actions without personalization evidence', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, []);

    const email = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'no-email-evidence',
        lead_specific_observation: '',
        personalization_packet: undefined,
      },
    });
    assert.equal(email.decision, 'blocked');
    assert.equal(email.reason, 'missing_personalization_evidence');

    const dm = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'no-dm-evidence',
        channel: 'linkedin',
        step_type: 'send message',
        subject: '',
        body: 'thanks for connecting. happy to send a quick breakdown if useful',
        lead_specific_observation: '',
        personalization_packet: undefined,
      },
    });
    assert.equal(dm.decision, 'blocked');
    assert.equal(dm.reason, 'missing_personalization_evidence');

    const xTouch = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'no-x-evidence',
        channel: 'x',
        step_type: 'reply',
        subject: '',
        body: 'this seems relevant to dashboard adoption work',
        lead_specific_observation: '',
        personalization_packet: undefined,
      },
    });
    assert.equal(xTouch.decision, 'blocked');
    assert.equal(xTouch.reason, 'missing_personalization_evidence');

    const connectionNote = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        ...basePayload,
        apollo_task_id: 'no-note-evidence',
        channel: 'linkedin',
        step_type: 'connection_request',
        subject: '',
        body: 'saw your work on dashboards and wanted to connect',
        lead_specific_observation: '',
        personalization_packet: undefined,
      },
    });
    assert.equal(connectionNote.decision, 'blocked');
    assert.equal(connectionNote.reason, 'missing_personalization_evidence');
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

test('completion_pending blocks sends but allows completion-only retry without copy fields', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      { ...basePayload, status: 'completion_pending', sent_at: '2026-04-30T10:01:00Z' },
    ]);

    const result = __test__.claim({
      stateDir: state.stateDir,
      ledgerPath: state.ledgerPath,
      payload: {
        apollo_task_id: basePayload.apollo_task_id,
        channel: basePayload.channel,
        step_type: basePayload.step_type,
        contact_email: basePayload.contact_email,
        run_started_at: basePayload.run_started_at,
        local_date: basePayload.local_date,
      },
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

test('audit reports historic placeholder, internal-label, and static-template copy issues', () => {
  const state = tempState();
  try {
    writeLedger(state.ledgerPath, [
      {
        ...basePayload,
        apollo_task_id: 'placeholder-copy',
        status: 'sent',
        body: '[First name] - noticed [trigger].\n\nwant me to send a quick breakdown for [Company]?',
        sent_at: '2026-04-30T10:01:00Z',
      },
      {
        ...basePayload,
        apollo_task_id: 'static-copy',
        status: 'completed',
        body: 'victor - noticed your product.\n\nin complex dashboards, most users only use a small slice because they dont know what to do next or where to go.\n\nwarpy lets them ask in plain english and have the dashboard filter, navigate, and take the next approved action right there.\n\nwant me to send a quick breakdown for tonkean?',
        sent_at: '2026-04-30T10:02:00Z',
      },
      {
        ...basePayload,
        apollo_task_id: 'internal-source-label',
        status: 'sent',
        body: 'noticed Amplemarket search listed this as a support platform with workflow-heavy dashboards.',
        sent_at: '2026-04-30T10:03:00Z',
      },
    ]);

    const result = __test__.audit({ ledgerPath: state.ledgerPath });

    assert.equal(result.copy_quality_issue_records, 3);
    assert.equal(result.copy_quality_issue_counts.unresolved_copy_placeholder, 1);
    assert.equal(result.copy_quality_issue_counts.static_apollo_template_copy, 1);
    assert.equal(result.copy_quality_issue_counts.internal_source_label_in_copy, 1);
  } finally {
    state.cleanup();
  }
});
