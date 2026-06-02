#!/usr/bin/env node

const process = require('node:process');

const options = parseArgs(process.argv.slice(2));
const appPort = Number(options.appPort || 19274);
const cdpPort = Number(options.cdpPort || 19374);
const targetUrlPart = options.target || 'intent-browser-guide.html';

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const target = await findTarget(cdpPort, targetUrlPart);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);

  try {
    await setMode(appPort, 'quick-edit');
    await waitForTargetMode(cdp, 'quick-edit');
    await cdp.call('Runtime.evaluate', {
      awaitPromise: true,
      expression: `
        (() => {
          const el = document.querySelector('[data-testid="guide-title"]');
          const rect = el.getBoundingClientRect();
          const init = { bubbles: true, cancelable: true, composed: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, detail: 2 };
          el.dispatchEvent(new MouseEvent('dblclick', init));
          el.innerText = 'Intent Browser turns page feedback into code-ready diffs.';
          el.dispatchEvent(new FocusEvent('blur', { bubbles: true, cancelable: true, composed: true }));
          return { text: el.innerText, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
        })()
      `
    });
    await waitForAction(appPort, 'text.replace');

    await setMode(appPort, 'annotation');
    await waitForTargetMode(cdp, 'annotation');
    await delay(120);
    const annotationPoint = await cdp.call('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        (() => {
          const el = document.querySelector('[data-testid="guide-lead"]');
          const rect = el.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()
      `
    });
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      x: annotationPoint.result.value.x,
      y: annotationPoint.result.value.y
    });
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      x: annotationPoint.result.value.x,
      y: annotationPoint.result.value.y
    });
    await delay(80);
    await cdp.call('Input.insertText', {
      text: 'Clarify that the measured switch latency comes from the CLI smoke test.'
    });
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      modifiers: 2
    });
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      modifiers: 0
    });
    await waitForAction(appPort, 'annotation.create');

    const payload = await fetchJson(`http://127.0.0.1:${appPort}/events?since=0`);
    const summary = payload.events.map((event) => ({
      sequence: event.sequence,
      action: event.action,
      selector: event.target && event.target.cssSelector,
      xpath: event.target && event.target.xpath,
      hasCdp: Boolean(event.target && event.target.cdp && event.target.cdp.backendNodeId),
      change: event.change
    }));
    console.log(JSON.stringify({ ok: true, eventCount: payload.events.length, summary }, null, 2));
  } finally {
    cdp.close();
  }
}

async function setMode(port, mode) {
  const response = await fetch(`http://127.0.0.1:${port}/mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode })
  });
  if (!response.ok) {
    throw new Error(`mode ${mode} failed: HTTP ${response.status}`);
  }
}

async function waitForAction(port, action) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const payload = await fetchJson(`http://127.0.0.1:${port}/events?since=0`);
    if (payload.events.some((event) => event.action === action)) {
      return payload.events;
    }
    await delay(80);
  }
  throw new Error(`Timed out waiting for ${action}`);
}

async function waitForTargetMode(cdp, mode) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await cdp.call('Runtime.evaluate', {
      returnByValue: true,
      expression: 'document.documentElement.getAttribute("data-intent-browser-mode")'
    });
    if (result.result.value === mode) {
      return;
    }
    await delay(40);
  }
  throw new Error(`Timed out waiting for target mode ${mode}`);
}

async function findTarget(port, urlPart) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const target = targets.find((item) => item.url && item.url.includes(urlPart));
  if (!target) {
    throw new Error(`No CDP target containing ${urlPart}`);
  }
  return target;
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();

    socket.addEventListener('open', () => {
      resolve({
        call(method, params = {}) {
          const messageId = ++id;
          socket.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((innerResolve, innerReject) => {
            pending.set(messageId, { resolve: innerResolve, reject: innerReject });
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) {
        return;
      }
      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        callbacks.reject(new Error(message.error.message));
      } else {
        callbacks.resolve(message.result);
      }
    });
    socket.addEventListener('error', () => reject(new Error(`Failed to connect ${wsUrl}`)));
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed: HTTP ${response.status}`);
  }
  return response.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}
