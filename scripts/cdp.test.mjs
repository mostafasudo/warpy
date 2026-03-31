import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('getRuntimeDir follows platform-specific runtime conventions', () => {
  assert.equal(
    __test__.getRuntimeDir({ platform: 'darwin', env: {}, home: '/Users/tester' }),
    '/Users/tester/.cache/cdp',
  );

  assert.equal(
    __test__.getRuntimeDir({ platform: 'linux', env: { XDG_RUNTIME_DIR: '/run/user/501' }, home: '/home/tester' }),
    '/run/user/501/cdp',
  );

  assert.equal(
    __test__.getRuntimeDir({ platform: 'win32', env: { LOCALAPPDATA: 'C:/Users/tester/AppData/Local' }, home: 'C:/Users/tester' }),
    'C:\\Users\\tester\\AppData\\Local\\cdp',
  );
});

test('getPortFileCandidates prioritizes overrides and known browser locations', () => {
  const candidates = __test__.getPortFileCandidates({
    platform: 'darwin',
    env: { CDP_PORT_FILE: '/tmp/override-port' },
    home: '/Users/tester',
  });

  assert.equal(candidates[0], '/tmp/override-port');
  assert.ok(candidates.includes('/Users/tester/Library/Application Support/Google/Chrome/DevToolsActivePort'));
  assert.ok(candidates.includes('/Users/tester/Library/Application Support/BraveSoftware/Brave-Browser/Default/DevToolsActivePort'));
});

test('readWsUrlFromPortFile parses Chrome DevToolsActivePort files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cdp-portfile-'));
  const portFile = join(directory, 'DevToolsActivePort');

  try {
    writeFileSync(portFile, '9222\n/devtools/browser/test-id\n');
    assert.equal(
      __test__.readWsUrlFromPortFile(portFile, '127.0.0.2'),
      'ws://127.0.0.2:9222/devtools/browser/test-id',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('URL validation keeps navigation strict and open flexible', () => {
  assert.doesNotThrow(() => __test__.validateNavigationUrl('https://example.com'));
  assert.throws(() => __test__.validateNavigationUrl('about:blank'), /Only http\/https URLs allowed/);

  assert.doesNotThrow(() => __test__.validateOpenUrl('about:blank'));
  assert.doesNotThrow(() => __test__.validateOpenUrl('http://example.com'));
  assert.throws(() => __test__.validateOpenUrl('file:///tmp/test.html'), /Only about\/http\/https URLs allowed/);
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
