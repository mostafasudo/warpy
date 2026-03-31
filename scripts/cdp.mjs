#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { resolve, win32 } from 'path';
import { spawn } from 'child_process';
import net from 'net';
import { pathToFileURL } from 'url';

const TIMEOUT = 15000;
const CONNECT_TIMEOUT = 60000;
const NAVIGATION_TIMEOUT = 30000;
const DAEMON_CONNECT_DELAY = 300;
const DAEMON_CONNECT_RETRIES = Math.ceil(CONNECT_TIMEOUT / DAEMON_CONNECT_DELAY);
const WAITING_MESSAGE_DELAY = 1000;
const MIN_TARGET_PREFIX_LEN = 8;
const IS_WINDOWS = process.platform === 'win32';

if (!IS_WINDOWS) process.umask(0o077);

function getRuntimeDir({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === 'win32') {
    return win32.resolve(env.LOCALAPPDATA || win32.resolve(home, 'AppData', 'Local'), 'cdp');
  }

  if (env.XDG_RUNTIME_DIR) {
    return resolve(env.XDG_RUNTIME_DIR, 'cdp');
  }

  return resolve(home, '.cache', 'cdp');
}

const RUNTIME_DIR = getRuntimeDir();
const SOCKET_PATH = IS_WINDOWS ? '\\\\.\\pipe\\cdp-browser' : resolve(RUNTIME_DIR, 'browser.sock');
const LAUNCH_LOCK_PATH = resolve(RUNTIME_DIR, 'browser.lock');
const PAGES_CACHE = resolve(RUNTIME_DIR, 'pages.json');

try {
  mkdirSync(RUNTIME_DIR, { recursive: true, mode: 0o700 });
} catch {}

const NEEDS_TARGET = new Set([
  'snap', 'snapshot', 'eval', 'shot', 'screenshot', 'html', 'nav', 'navigate',
  'net', 'network', 'click', 'clickxy', 'type', 'loadall', 'evalraw',
]);

function getPortFileCandidates({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  const candidates = [env.CDP_PORT_FILE];

  if (platform === 'darwin') {
    for (const browser of [
      'Google/Chrome',
      'Google/Chrome Beta',
      'Google/Chrome for Testing',
      'Chromium',
      'BraveSoftware/Brave-Browser',
      'Microsoft Edge',
    ]) {
      candidates.push(resolve(home, 'Library/Application Support', browser, 'DevToolsActivePort'));
      candidates.push(resolve(home, 'Library/Application Support', browser, 'Default', 'DevToolsActivePort'));
    }
  }

  if (platform === 'linux') {
    for (const browser of [
      'google-chrome',
      'google-chrome-beta',
      'chromium',
      'vivaldi',
      'vivaldi-snapshot',
      'BraveSoftware/Brave-Browser',
      'microsoft-edge',
    ]) {
      candidates.push(resolve(home, '.config', browser, 'DevToolsActivePort'));
      candidates.push(resolve(home, '.config', browser, 'Default', 'DevToolsActivePort'));
    }

    for (const [appId, browser] of [
      ['org.chromium.Chromium', 'chromium'],
      ['com.google.Chrome', 'google-chrome'],
      ['com.brave.Browser', 'BraveSoftware/Brave-Browser'],
      ['com.microsoft.Edge', 'microsoft-edge'],
      ['com.vivaldi.Vivaldi', 'vivaldi'],
    ]) {
      candidates.push(resolve(home, '.var', 'app', appId, 'config', browser, 'DevToolsActivePort'));
      candidates.push(resolve(home, '.var', 'app', appId, 'config', browser, 'Default', 'DevToolsActivePort'));
    }
  }

  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || win32.resolve(home, 'AppData', 'Local');
    for (const browser of ['Google/Chrome', 'BraveSoftware/Brave-Browser', 'Microsoft/Edge']) {
      candidates.push(win32.resolve(base, browser, 'User Data', 'DevToolsActivePort'));
      candidates.push(win32.resolve(base, browser, 'User Data', 'Default', 'DevToolsActivePort'));
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

function readWsUrlFromPortFile(portFile, host = process.env.CDP_HOST || '127.0.0.1') {
  const lines = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0] || !lines[1]) {
    throw new Error(`Invalid DevToolsActivePort file: ${portFile}`);
  }
  return `ws://${host}:${lines[0]}${lines[1]}`;
}

function getWsUrl() {
  const portFile = getPortFileCandidates().find((candidate) => existsSync(candidate));
  if (!portFile) {
    throw new Error('No DevToolsActivePort found. Enable remote debugging at chrome://inspect/#remote-debugging or set CDP_PORT_FILE.');
  }
  return readWsUrlFromPortFile(portFile);
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function removePath(path) {
  if (IS_WINDOWS && path.startsWith('\\\\.\\pipe\\')) return;
  try { rmSync(path, { force: true, recursive: true }); } catch {}
}

function readPagesCache() {
  if (!existsSync(PAGES_CACHE)) return null;
  try {
    return JSON.parse(readFileSync(PAGES_CACHE, 'utf8'));
  } catch {
    return null;
  }
}

function writePagesCache(pages) {
  writeFileSync(PAGES_CACHE, JSON.stringify(pages));
}

function resolvePrefix(prefix, candidates, noun = 'target', missingHint = '') {
  const upper = prefix.toUpperCase();
  const matches = candidates.filter((candidate) => candidate.toUpperCase().startsWith(upper));
  if (matches.length === 0) {
    const hint = missingHint ? ` ${missingHint}` : '';
    throw new Error(`No ${noun} matching prefix "${prefix}".${hint}`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous prefix "${prefix}" — matches ${matches.length} ${noun}s. Use more characters.`);
  }
  return matches[0];
}

function validateUrl(url, allowedProtocols, errorPrefix) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`${errorPrefix}, got: ${url}`);
  }
}

function validateNavigationUrl(url) {
  validateUrl(url, ['http:', 'https:'], 'Only http/https URLs allowed');
}

function validateOpenUrl(url) {
  validateUrl(url, ['about:', 'http:', 'https:'], 'Only about/http/https URLs allowed');
}

function getDisplayPrefixLength(targetIds) {
  if (targetIds.length === 0) return MIN_TARGET_PREFIX_LEN;
  const maxLen = Math.max(...targetIds.map((id) => id.length));
  for (let len = MIN_TARGET_PREFIX_LEN; len <= maxLen; len++) {
    const prefixes = new Set(targetIds.map((id) => id.slice(0, len).toUpperCase()));
    if (prefixes.size === targetIds.length) return len;
  }
  return maxLen;
}

function shouldRecoverSession(error) {
  return /Session with given id not found|No target with given id found|Target closed|Cannot find context with specified id/i.test(error.message);
}

function normalizeCommandArgs(cmd, cmdArgs) {
  const args = [...cmdArgs];

  if (cmd === 'eval') {
    const expr = args.join(' ');
    if (!expr) throw new Error('Error: expression required');
    return [expr];
  }

  if (cmd === 'type') {
    const text = args.join(' ');
    if (!text) throw new Error('Error: text required');
    return [text];
  }

  if (cmd === 'evalraw') {
    if (!args[0]) throw new Error('Error: CDP method required');
    if (args.length > 2) return [args[0], args.slice(1).join(' ')];
    return args;
  }

  if ((cmd === 'nav' || cmd === 'navigate') && !args[0]) {
    throw new Error('Error: URL required');
  }

  return args;
}

class CDP {
  #ws;
  #id = 0;
  #pending = new Map();
  #eventHandlers = new Map();
  #closeHandlers = [];

  async connect(wsUrl, timeout = CONNECT_TIMEOUT) {
    return new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { this.#ws?.close(); } catch {}
        rejectPromise(new Error('Timed out waiting for Chrome to allow remote debugging'));
      }, timeout);

      this.#ws = new WebSocket(wsUrl);
      this.#ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise();
      };
      this.#ws.onerror = (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectPromise(new Error(`WebSocket error: ${event.message || event.type}`));
      };
      this.#ws.onclose = () => {
        clearTimeout(timer);
        this.#closeHandlers.forEach((handler) => handler());
      };
      this.#ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && this.#pending.has(message.id)) {
          const { resolvePending, rejectPending } = this.#pending.get(message.id);
          this.#pending.delete(message.id);
          if (message.error) rejectPending(new Error(message.error.message));
          else resolvePending(message.result);
          return;
        }

        if (!message.method || !this.#eventHandlers.has(message.method)) return;
        for (const subscription of [...this.#eventHandlers.get(message.method)]) {
          if (subscription.sessionId && subscription.sessionId !== message.sessionId) continue;
          subscription.handler(message.params || {}, message);
        }
      };
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    return new Promise((resolvePending, rejectPending) => {
      this.#pending.set(id, { resolvePending, rejectPending });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.#ws.send(JSON.stringify(message));
      setTimeout(() => {
        if (!this.#pending.has(id)) return;
        this.#pending.delete(id);
        rejectPending(new Error(`Timeout: ${method}`));
      }, TIMEOUT);
    });
  }

  onEvent(method, handler, sessionId) {
    if (!this.#eventHandlers.has(method)) this.#eventHandlers.set(method, new Set());
    const handlers = this.#eventHandlers.get(method);
    const subscription = { handler, sessionId };
    handlers.add(subscription);
    return () => {
      handlers.delete(subscription);
      if (handlers.size === 0) this.#eventHandlers.delete(method);
    };
  }

  waitForEvent(method, timeout = TIMEOUT, sessionId) {
    let settled = false;
    let off;
    let timer;

    const promise = new Promise((resolvePromise, rejectPromise) => {
      off = this.onEvent(method, (params) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        off();
        resolvePromise(params);
      }, sessionId);

      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        off();
        rejectPromise(new Error(`Timeout waiting for event: ${method}`));
      }, timeout);
    });

    return {
      promise,
      cancel() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        off?.();
      },
    };
  }

  onClose(handler) {
    this.#closeHandlers.push(handler);
  }

  close() {
    try { this.#ws?.close(); } catch {}
  }
}

async function getPages(cdp) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  return targetInfos.filter((target) => target.type === 'page' && !target.url.startsWith('chrome://'));
}

function formatPageList(pages) {
  const prefixLen = getDisplayPrefixLength(pages.map((page) => page.targetId));
  return pages.map((page) => {
    const id = page.targetId.slice(0, prefixLen).padEnd(prefixLen);
    const title = page.title.substring(0, 54).padEnd(54);
    return `${id}  ${title}  ${page.url}`;
  }).join('\n');
}

function shouldShowAxNode(node, compact = false) {
  const role = node.role?.value || '';
  const name = node.name?.value ?? '';
  const value = node.value?.value;
  if (compact && role === 'InlineTextBox') return false;
  return role !== 'none' && role !== 'generic' && !(name === '' && (value === '' || value == null));
}

function formatAxNode(node, depth) {
  const role = node.role?.value || '';
  const name = node.name?.value ?? '';
  const value = node.value?.value;
  const indent = '  '.repeat(Math.min(depth, 10));
  let line = `${indent}[${role}]`;
  if (name !== '') line += ` ${name}`;
  if (!(value === '' || value == null)) line += ` = ${JSON.stringify(value)}`;
  return line;
}

function orderedAxChildren(node, nodesById, childrenByParent) {
  const children = [];
  const seen = new Set();

  for (const childId of node.childIds || []) {
    const child = nodesById.get(childId);
    if (!child || seen.has(child.nodeId)) continue;
    seen.add(child.nodeId);
    children.push(child);
  }

  for (const child of childrenByParent.get(node.nodeId) || []) {
    if (seen.has(child.nodeId)) continue;
    seen.add(child.nodeId);
    children.push(child);
  }

  return children;
}

async function snapshotStr(cdp, sessionId, compact = false) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree', {}, sessionId);
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  const childrenByParent = new Map();

  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!childrenByParent.has(node.parentId)) childrenByParent.set(node.parentId, []);
    childrenByParent.get(node.parentId).push(node);
  }

  const lines = [];
  const visited = new Set();

  function visit(node, depth) {
    if (!node || visited.has(node.nodeId)) return;
    visited.add(node.nodeId);
    if (shouldShowAxNode(node, compact)) lines.push(formatAxNode(node, depth));
    for (const child of orderedAxChildren(node, nodesById, childrenByParent)) {
      visit(child, depth + 1);
    }
  }

  const roots = nodes.filter((node) => !node.parentId || !nodesById.has(node.parentId));
  for (const root of roots) visit(root, 0);
  for (const node of nodes) visit(node, 0);

  return lines.join('\n');
}

async function evalStr(cdp, sessionId, expression) {
  await cdp.send('Runtime.enable', {}, sessionId);
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description);
  }

  const value = result.result.value;
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
}

async function shotStr(cdp, sessionId, filePath, targetId) {
  let dpr = 1;

  try {
    const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
    dpr = metrics.visualViewport?.clientWidth
      ? metrics.cssVisualViewport?.clientWidth
        ? Math.round((metrics.visualViewport.clientWidth / metrics.cssVisualViewport.clientWidth) * 100) / 100
        : 1
      : 1;

    const { deviceScaleFactor } = await cdp.send('Emulation.getDeviceMetricsOverride', {}, sessionId).catch(() => ({}));
    if (deviceScaleFactor) dpr = deviceScaleFactor;
  } catch {}

  if (dpr === 1) {
    try {
      const raw = await evalStr(cdp, sessionId, 'window.devicePixelRatio');
      const parsed = parseFloat(raw);
      if (parsed > 0) dpr = parsed;
    } catch {}
  }

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const out = filePath || resolve(RUNTIME_DIR, `screenshot-${(targetId || 'unknown').slice(0, 8)}.png`);
  writeFileSync(out, Buffer.from(data, 'base64'));

  const lines = [out];
  lines.push(`Screenshot saved. Device pixel ratio (DPR): ${dpr}`);
  lines.push('Coordinate mapping:');
  lines.push(`  Screenshot pixels → CSS pixels (for CDP Input events): divide by ${dpr}`);
  lines.push(`  e.g. screenshot point (${Math.round(100 * dpr)}, ${Math.round(200 * dpr)}) → CSS (100, 200) → use clickxy <target> 100 200`);
  if (dpr !== 1) {
    lines.push(`  On this ${dpr}x display: CSS px = screenshot px / ${dpr} ≈ screenshot px × ${Math.round(100 / dpr) / 100}`);
  }
  return lines.join('\n');
}

async function htmlStr(cdp, sessionId, selector) {
  const expression = selector
    ? `document.querySelector(${JSON.stringify(selector)})?.outerHTML || 'Element not found'`
    : 'document.documentElement.outerHTML';
  return evalStr(cdp, sessionId, expression);
}

async function waitForDocumentReady(cdp, sessionId, timeoutMs = NAVIGATION_TIMEOUT) {
  const deadline = Date.now() + timeoutMs;
  let lastState = '';
  let lastError;

  while (Date.now() < deadline) {
    try {
      const state = await evalStr(cdp, sessionId, 'document.readyState');
      lastState = state;
      if (state === 'complete') return;
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }

  if (lastState) {
    throw new Error(`Timed out waiting for navigation to finish (last readyState: ${lastState})`);
  }
  if (lastError) {
    throw new Error(`Timed out waiting for navigation to finish (${lastError.message})`);
  }
  throw new Error('Timed out waiting for navigation to finish');
}

async function navStr(cdp, sessionId, url) {
  validateNavigationUrl(url);
  await cdp.send('Page.enable', {}, sessionId);
  const loadEvent = cdp.waitForEvent('Page.loadEventFired', NAVIGATION_TIMEOUT, sessionId);
  const result = await cdp.send('Page.navigate', { url }, sessionId);

  if (result.errorText) {
    loadEvent.cancel();
    throw new Error(result.errorText);
  }

  if (result.loaderId) await loadEvent.promise;
  else loadEvent.cancel();

  await waitForDocumentReady(cdp, sessionId, 5000);
  return `Navigated to ${url}`;
}

async function netStr(cdp, sessionId) {
  const raw = await evalStr(cdp, sessionId, `JSON.stringify(performance.getEntriesByType('resource').map(e => ({
    name: e.name.substring(0, 120), type: e.initiatorType,
    duration: Math.round(e.duration), size: e.transferSize
  })))`);

  return JSON.parse(raw).map((entry) =>
    `${String(entry.duration).padStart(5)}ms  ${String(entry.size || '?').padStart(8)}B  ${entry.type.padEnd(8)}  ${entry.name}`
  ).join('\n');
}

async function clickStr(cdp, sessionId, selector) {
  if (!selector) throw new Error('CSS selector required');
  const expression = `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, tag: el.tagName, text: el.textContent.trim().substring(0, 80) };
    })()
  `;
  const result = await evalStr(cdp, sessionId, expression);
  const parsed = JSON.parse(result);
  if (!parsed.ok) throw new Error(parsed.error);
  return `Clicked <${parsed.tag}> "${parsed.text}"`;
}

async function clickXyStr(cdp, sessionId, x, y) {
  const cssX = parseFloat(x);
  const cssY = parseFloat(y);

  if (isNaN(cssX) || isNaN(cssY)) {
    throw new Error('x and y must be numbers (CSS pixels)');
  }

  const base = { x: cssX, y: cssY, button: 'left', clickCount: 1, modifiers: 0 };
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved' }, sessionId);
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' }, sessionId);
  await sleep(50);
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' }, sessionId);
  return `Clicked at CSS (${cssX}, ${cssY})`;
}

async function typeStr(cdp, sessionId, text) {
  if (text == null || text === '') throw new Error('text required');
  await cdp.send('Input.insertText', { text }, sessionId);
  return `Typed ${text.length} characters`;
}

async function loadAllStr(cdp, sessionId, selector, intervalMs = 1500) {
  if (!selector) throw new Error('CSS selector required');
  let clicks = 0;
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    const exists = await evalStr(cdp, sessionId, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (exists !== 'true') break;

    const clicked = await evalStr(cdp, sessionId, `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return true;
      })()
    `);
    if (clicked !== 'true') break;

    clicks++;
    await sleep(intervalMs);
  }

  return `Clicked "${selector}" ${clicks} time(s) until it disappeared`;
}

async function evalRawStr(cdp, sessionId, method, paramsJson) {
  if (!method) throw new Error('CDP method required (e.g. "DOM.getDocument")');
  let params = {};

  if (paramsJson) {
    try {
      params = JSON.parse(paramsJson);
    } catch {
      throw new Error(`Invalid JSON params: ${paramsJson}`);
    }
  }

  const result = await cdp.send(method, params, sessionId);
  return JSON.stringify(result, null, 2);
}

async function openStr(cdp, url = 'about:blank') {
  validateOpenUrl(url);
  const { targetId } = await cdp.send('Target.createTarget', { url });
  return JSON.stringify({ targetId, url });
}

async function runDaemon() {
  removePath(SOCKET_PATH);

  let alive = true;
  let cdp = null;
  let browserReady = false;
  const sessionsByTarget = new Map();
  const targetsBySession = new Map();
  let readyError = null;

  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  ready.catch(() => {});

  const server = net.createServer((conn) => {
    let buffer = '';

    conn.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        let request;

        try {
          request = JSON.parse(line);
        } catch {
          conn.write(JSON.stringify({ ok: false, error: 'Invalid JSON request', id: null }) + '\n');
          continue;
        }

        handleCommand(request).then((response) => {
          const payload = JSON.stringify({ ...response, id: request.id }) + '\n';
          if (response.stopAfter) conn.end(payload, shutdown);
          else conn.write(payload);
        });
      }
    });
  });

  function trackSession(targetId, sessionId) {
    sessionsByTarget.set(targetId, sessionId);
    targetsBySession.set(sessionId, targetId);
  }

  function dropTarget(targetId) {
    const sessionId = sessionsByTarget.get(targetId);
    if (!sessionId) return;
    sessionsByTarget.delete(targetId);
    targetsBySession.delete(sessionId);
  }

  function dropSession(sessionId) {
    const targetId = targetsBySession.get(sessionId);
    if (!targetId) return;
    targetsBySession.delete(sessionId);
    sessionsByTarget.delete(targetId);
  }

  function shutdown() {
    if (!alive) return;
    alive = false;
    releaseLaunchLock();
    try { server.close(); } catch {}
    removePath(SOCKET_PATH);
    try { cdp?.close(); } catch {}
    process.exit(0);
  }

  async function ensureReady() {
    if (readyError) throw readyError;
    await ready;
  }

  async function ensureSession(targetId) {
    const existing = sessionsByTarget.get(targetId);
    if (existing) return existing;
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    trackSession(targetId, sessionId);
    return sessionId;
  }

  async function withSession(targetId, fn) {
    let sessionId = await ensureSession(targetId);

    try {
      return await fn(sessionId);
    } catch (error) {
      if (!shouldRecoverSession(error)) throw error;
      dropTarget(targetId);
      sessionId = await ensureSession(targetId);
      return fn(sessionId);
    }
  }

  async function detachTarget(targetId) {
    const sessionId = sessionsByTarget.get(targetId);
    if (!sessionId) return `No active session for ${targetId}`;

    try {
      await cdp.send('Target.detachFromTarget', { sessionId });
    } catch (error) {
      if (!shouldRecoverSession(error)) throw error;
    } finally {
      dropTarget(targetId);
    }

    return `Detached ${targetId}`;
  }

  async function handleCommand(request) {
    const { cmd, args = [], targetId } = request;

    try {
      if (cmd === 'status') {
        return { ok: true, result: JSON.stringify({ ready: browserReady, error: readyError?.message || null }) };
      }

      if (cmd === 'stop') {
        if (!targetId) return { ok: true, result: '', stopAfter: true };
        await ensureReady();
        return { ok: true, result: await detachTarget(targetId) };
      }

      await ensureReady();

      if (cmd === 'list') {
        const pages = await getPages(cdp);
        return { ok: true, result: formatPageList(pages) };
      }

      if (cmd === 'list_raw') {
        const pages = await getPages(cdp);
        return { ok: true, result: JSON.stringify(pages) };
      }

      if (cmd === 'open') {
        return { ok: true, result: await openStr(cdp, args[0]) };
      }

      if (!targetId) {
        return { ok: false, error: 'targetId required' };
      }

      const result = await withSession(targetId, async (sessionId) => {
        switch (cmd) {
          case 'snap':
          case 'snapshot':
            return snapshotStr(cdp, sessionId, true);
          case 'eval':
            return evalStr(cdp, sessionId, args[0]);
          case 'shot':
          case 'screenshot':
            return shotStr(cdp, sessionId, args[0], targetId);
          case 'html':
            return htmlStr(cdp, sessionId, args[0]);
          case 'nav':
          case 'navigate':
            return navStr(cdp, sessionId, args[0]);
          case 'net':
          case 'network':
            return netStr(cdp, sessionId);
          case 'click':
            return clickStr(cdp, sessionId, args[0]);
          case 'clickxy':
            return clickXyStr(cdp, sessionId, args[0], args[1]);
          case 'type':
            return typeStr(cdp, sessionId, args[0]);
          case 'loadall':
            return loadAllStr(cdp, sessionId, args[0], args[1] ? parseInt(args[1], 10) : 1500);
          case 'evalraw':
            return evalRawStr(cdp, sessionId, args[0], args[1]);
          default:
            throw new Error(`Unknown command: ${cmd}`);
        }
      });

      return { ok: true, result: result ?? '' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async function initChrome() {
    cdp = new CDP();
    await cdp.connect(getWsUrl());
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    cdp.onEvent('Target.targetDestroyed', ({ targetId }) => dropTarget(targetId));
    cdp.onEvent('Target.detachedFromTarget', ({ sessionId }) => dropSession(sessionId));
    cdp.onClose(shutdown);
    browserReady = true;
    resolveReady();
  }

  server.on('error', (error) => {
    releaseLaunchLock();
    if (error.code === 'EADDRINUSE') process.exit(0);
    process.stderr.write(`Daemon: ${error.message}\n`);
    process.exit(1);
  });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(SOCKET_PATH, () => {
    releaseLaunchLock();
    initChrome().catch((error) => {
      readyError = error;
      rejectReady(error);
      setTimeout(shutdown, 1000);
    });
  });
}

function connectToSocket(socketPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const connection = net.connect(socketPath);
    connection.on('connect', () => resolvePromise(connection));
    connection.on('error', rejectPromise);
  });
}

function acquireLaunchLock() {
  try {
    mkdirSync(LAUNCH_LOCK_PATH);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

function releaseLaunchLock() {
  removePath(LAUNCH_LOCK_PATH);
}

async function isDaemonSocketReachable() {
  try {
    const connection = await connectToSocket(SOCKET_PATH);
    connection.end();
    return true;
  } catch {
    return false;
  }
}

async function getOrStartBrowserDaemon() {
  try {
    return await connectToReadyDaemon();
  } catch {}

  const ownsLaunchLock = acquireLaunchLock();
  if (ownsLaunchLock) {
    const daemonExists = await isDaemonSocketReachable();
    if (!daemonExists) {
      removePath(SOCKET_PATH);

      const child = spawn(process.execPath, [process.argv[1], '_daemon'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
  }

  let waitingNoticeShown = false;
  const startedAt = Date.now();

  try {
    for (let attempt = 0; attempt < DAEMON_CONNECT_RETRIES; attempt++) {
      try {
        return await connectToReadyDaemon();
      } catch {}

      if (!waitingNoticeShown && Date.now() - startedAt >= WAITING_MESSAGE_DELAY) {
        process.stderr.write('Waiting for Chrome\'s "Allow remote debugging?" dialog...\n');
        waitingNoticeShown = true;
      }
      await sleep(DAEMON_CONNECT_DELAY);
    }
  } finally {
    if (ownsLaunchLock) releaseLaunchLock();
  }

  removePath(LAUNCH_LOCK_PATH);
  throw new Error('Daemon failed to start — allow remote debugging in Chrome and try again.');
}

function sendCommand(connection, request) {
  return new Promise((resolvePromise, rejectPromise) => {
    let buffer = '';
    let settled = false;

    const cleanup = () => {
      connection.off('data', onData);
      connection.off('error', onError);
      connection.off('end', onEnd);
      connection.off('close', onClose);
    };

    const onData = (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;
      settled = true;
      cleanup();
      resolvePromise(JSON.parse(buffer.slice(0, newlineIndex)));
      connection.end();
    };

    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(error);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new Error('Connection closed before response'));
    };

    const onClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new Error('Connection closed before response'));
    };

    connection.on('data', onData);
    connection.on('error', onError);
    connection.on('end', onEnd);
    connection.on('close', onClose);
    connection.write(JSON.stringify({ ...request, id: 1 }) + '\n');
  });
}

async function connectToReadyDaemon() {
  const connection = await connectToSocket(SOCKET_PATH);

  try {
    const response = await sendCommand(connection, { cmd: 'status' });
    if (!response.ok) throw new Error(response.error);

    const status = JSON.parse(response.result);
    if (status.error) throw new Error(status.error);
    if (!status.ready) throw new Error('Daemon is still waiting for Chrome permission');
  } catch (error) {
    throw error;
  }

  return connectToSocket(SOCKET_PATH);
}

async function fetchPagesFromDaemon() {
  const connection = await getOrStartBrowserDaemon();
  const response = await sendCommand(connection, { cmd: 'list_raw' });

  if (!response.ok) throw new Error(response.error);

  const pages = JSON.parse(response.result);
  writePagesCache(pages);
  return pages;
}

async function openTarget(url) {
  const connection = await getOrStartBrowserDaemon();
  const response = await sendCommand(connection, { cmd: 'open', args: [url || 'about:blank'] });

  if (!response.ok) throw new Error(response.error);

  const opened = JSON.parse(response.result);
  const pages = readPagesCache() || [];
  writePagesCache([
    ...pages.filter((page) => page.targetId !== opened.targetId),
    { targetId: opened.targetId, title: opened.url, url: opened.url },
  ]);
  return `Opened new tab: ${opened.targetId.slice(0, 8)}  ${opened.url}`;
}

function tryResolveTargetId(targetPrefix, pages) {
  return resolvePrefix(targetPrefix, pages.map((page) => page.targetId), 'target', 'Run "cdp list".');
}

async function resolveTargetId(targetPrefix) {
  const cachedPages = readPagesCache();
  if (cachedPages) {
    try {
      return tryResolveTargetId(targetPrefix, cachedPages);
    } catch {}
  }

  return tryResolveTargetId(targetPrefix, await fetchPagesFromDaemon());
}

async function stopDaemon(targetPrefix) {
  let connection;

  try {
    connection = await connectToSocket(SOCKET_PATH);
  } catch {
    return;
  }

  if (!targetPrefix) {
    const response = await sendCommand(connection, { cmd: 'stop' });
    if (!response.ok) throw new Error(response.error);
    return;
  }

  const listResponse = await sendCommand(connection, { cmd: 'list_raw' });
  if (!listResponse.ok) throw new Error(listResponse.error);

  const pages = JSON.parse(listResponse.result);
  writePagesCache(pages);
  const targetId = tryResolveTargetId(targetPrefix, pages);
  const stopConnection = await connectToSocket(SOCKET_PATH);
  const stopResponse = await sendCommand(stopConnection, { cmd: 'stop', targetId });
  if (!stopResponse.ok) throw new Error(stopResponse.error);
}

const USAGE = `cdp - lightweight Chrome DevTools Protocol CLI (no Puppeteer)

Usage: cdp <command> [args]

  list                              List open pages (shows unique target prefixes)
  snap  <target>                    Accessibility tree snapshot
  eval  <target> <expr>             Evaluate JS expression
  shot  <target> [file]             Screenshot (default: screenshot-<target>.png in runtime dir); prints coordinate mapping
  html  <target> [selector]         Get HTML (full page or CSS selector)
  nav   <target> <url>              Navigate to URL and wait for load completion
  net   <target>                    Network performance entries
  click   <target> <selector>       Click an element by CSS selector
  clickxy <target> <x> <y>          Click at CSS pixel coordinates (see coordinate note below)
  type    <target> <text>           Type text at current focus via Input.insertText
                                    Works in cross-origin iframes unlike eval-based approaches
  loadall <target> <selector> [ms]  Repeatedly click a "load more" button until it disappears
                                    Optional interval in ms between clicks (default 1500)
  evalraw <target> <method> [json]  Send a raw CDP command; returns JSON result
                                    e.g. evalraw <t> "DOM.getDocument" '{}'
  open  [url]                       Open a new tab in the shared browser session (default: about:blank)
  stop  [target]                    Stop the shared daemon or detach one target session

<target> is a unique targetId prefix from "cdp list". If a prefix is ambiguous,
use more characters.

COORDINATE SYSTEM
  shot captures the viewport at the device's native resolution.
  The screenshot image size = CSS pixels × DPR (device pixel ratio).
  For CDP Input events (clickxy, etc.) you need CSS pixels, not image pixels.

    CSS pixels = screenshot image pixels / DPR

  shot prints the DPR and an example conversion for the current page.
  Typical Retina (DPR=2): CSS px ≈ screenshot px × 0.5
  If your viewer rescales the image further, account for that scaling too.

EVAL SAFETY NOTE
  Avoid index-based DOM selection (querySelectorAll(...)[i]) across multiple
  eval calls when the list can change between calls (e.g. after clicking
  "Ignore" buttons on a feed — indices shift). Prefer stable selectors or
  collect all data in a single eval.

DAEMON IPC (for advanced use / scripting)
  The browser session is shared through one daemon at:
    ${SOCKET_PATH}
  Protocol: newline-delimited JSON (one JSON object per line, UTF-8).
    Request:  {"id":<number>, "cmd":"<command>", "targetId":"<fullTargetId?>", "args":["arg1","arg2",...]}
    Response: {"id":<number>, "ok":true,  "result":"<string>"}
           or {"id":<number>, "ok":false, "error":"<message>"}
  Attached target sessions are reused while the daemon stays alive. The daemon
  exits when you run "cdp stop" or when Chrome closes the debugging session.
`;

async function main() {
  const [cmd, ...rawArgs] = process.argv.slice(2);

  if (cmd === '_daemon') {
    await runDaemon();
    return;
  }

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return;
  }

  if (cmd === 'list' || cmd === 'ls') {
    console.log(formatPageList(await fetchPagesFromDaemon()));
    return;
  }

  if (cmd === 'open') {
    console.log(await openTarget(rawArgs[0]));
    return;
  }

  if (cmd === 'stop') {
    await stopDaemon(rawArgs[0]);
    return;
  }

  if (!NEEDS_TARGET.has(cmd)) {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(USAGE);
    process.exit(1);
  }

  const targetPrefix = rawArgs[0];
  if (!targetPrefix) {
    console.error('Error: target ID required. Run "cdp list" first.');
    process.exit(1);
  }

  const targetId = await resolveTargetId(targetPrefix);
  const args = normalizeCommandArgs(cmd, rawArgs.slice(1));
  const connection = await getOrStartBrowserDaemon();
  const response = await sendCommand(connection, { cmd, args, targetId });

  if (response.ok) {
    if (response.result) console.log(response.result);
    return;
  }

  console.error('Error:', response.error);
  process.exit(1);
}

function isEntrypoint() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

export const __test__ = {
  connectToSocket,
  getDisplayPrefixLength,
  getPortFileCandidates,
  getRuntimeDir,
  normalizeCommandArgs,
  readWsUrlFromPortFile,
  resolvePrefix,
  sendCommand,
  validateNavigationUrl,
  validateOpenUrl,
};

if (isEntrypoint()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
