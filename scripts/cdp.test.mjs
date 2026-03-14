import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { __test__ } from './cdp.mjs';

test('resolvePrefix handles unique, ambiguous, and missing prefixes', () => {
  assert.equal(__test__.resolvePrefix('ABC12345', ['ABC12345AAAA', 'FFF99999BBBB']), 'ABC12345AAAA');

  assert.throws(
    () => __test__.resolvePrefix('ABC', ['ABC12345AAAA', 'ABC99999BBBB']),
    /Ambiguous prefix "ABC"/,
  );

  assert.throws(
    () => __test__.resolvePrefix('ZZZ', ['ABC12345AAAA'], 'target', 'Run "cdp list".'),
    /No target matching prefix "ZZZ"\. Run "cdp list"\./,
  );
});

test('getDisplayPrefixLength expands until prefixes are unique', () => {
  assert.equal(
    __test__.getDisplayPrefixLength([
      'ABCDEF0011111111',
      'ABCDEF1011111111',
      'BCDEF00111111111',
    ]),
    8,
  );
});

test('normalizeCommandArgs preserves the existing CLI behavior', () => {
  assert.deepEqual(__test__.normalizeCommandArgs('eval', ['document.body', '.innerHTML']), ['document.body .innerHTML']);
  assert.deepEqual(__test__.normalizeCommandArgs('type', ['hello', 'world']), ['hello world']);
  assert.deepEqual(__test__.normalizeCommandArgs('evalraw', ['Page.navigate', '{', '"url":"https://example.com"', '}']), ['Page.navigate', '{ "url":"https://example.com" }']);
  assert.deepEqual(__test__.normalizeCommandArgs('click', ['button.primary']), ['button.primary']);

  assert.throws(() => __test__.normalizeCommandArgs('eval', []), /Error: expression required/);
  assert.throws(() => __test__.normalizeCommandArgs('type', []), /Error: text required/);
  assert.throws(() => __test__.normalizeCommandArgs('evalraw', []), /Error: CDP method required/);
  assert.throws(() => __test__.normalizeCommandArgs('nav', []), /Error: URL required/);
});

test('sendCommand reads newline-delimited JSON responses over a unix socket', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'cdp-test-'));
  const socketPath = join(directory, 'daemon.sock');

  const server = net.createServer((connection) => {
    let buffer = '';
    connection.on('data', (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;
      const request = JSON.parse(buffer.slice(0, newlineIndex));
      connection.write(JSON.stringify({ id: request.id, ok: true, result: 'pong' }) + '\n');
    });
  });

  await new Promise((resolvePromise) => server.listen(socketPath, resolvePromise));

  try {
    const connection = await __test__.connectToSocket(socketPath);
    const response = await __test__.sendCommand(connection, { cmd: 'ping' });
    assert.deepEqual(response, { id: 1, ok: true, result: 'pong' });
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    rmSync(directory, { recursive: true, force: true });
  }
});
