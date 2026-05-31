const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const test = require('node:test');
const { AgentRpcServer, parseWsFrame } = require('../src/main/rpc-server');
const { SessionBus } = require('../src/main/session');

test('serves HTTP session and events', async () => {
  const session = new SessionBus({ session: 'rpc-http', url: 'http://example.test' });
  const server = new AgentRpcServer(session, {
    'mode.set': ({ mode }) => ({ ok: true, ...session.setMode(mode, 'test') })
  }, { port: 0 });
  const endpoint = await server.start();

  try {
    session.addDiff({ action: 'text.replace', change: { before: 'old', after: 'new' } });
    const events = await fetch(`${endpoint.httpUrl}/events?since=0`).then((response) => response.json());
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].sequence, 1);

    const mode = await fetch(`${endpoint.httpUrl}/mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'annotation' })
    }).then((response) => response.json());
    assert.equal(mode.mode, 'annotation');
  } finally {
    await server.close();
  }
});

test('supports WebSocket JSON-RPC session.get', async () => {
  const session = new SessionBus({ session: 'rpc-ws', url: 'http://example.test' });
  const server = new AgentRpcServer(session, {}, { port: 0 });
  const endpoint = await server.start();

  try {
    const response = await wsRequest(endpoint.port, {
      jsonrpc: '2.0',
      id: 7,
      method: 'session.get',
      params: {}
    });
    assert.equal(response.id, 7);
    assert.equal(response.result.sessionId, 'rpc-ws');
  } finally {
    await server.close();
  }
});

function wsRequest(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const key = crypto.randomBytes(16).toString('base64');
    let buffer = Buffer.alloc(0);
    let handshaken = false;
    const deadline = setTimeout(() => {
      socket.destroy();
      reject(new Error('WebSocket test timed out'));
    }, 2000);

    socket.on('connect', () => {
      socket.write([
        'GET /rpc HTTP/1.1',
        'Host: 127.0.0.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '\r\n'
      ].join('\r\n'));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshaken) {
        const marker = buffer.indexOf('\r\n\r\n');
        if (marker === -1) {
          return;
        }
        handshaken = true;
        buffer = buffer.slice(marker + 4);
        socket.write(encodeMaskedClientFrame(Buffer.from(JSON.stringify(payload), 'utf8')));
      }

      let parsed;
      while ((parsed = parseWsFrame(buffer))) {
        buffer = buffer.slice(parsed.consumed);
        const message = JSON.parse(parsed.payload.toString('utf8'));
        if (message.id === payload.id) {
          clearTimeout(deadline);
          socket.end();
          resolve(message);
          return;
        }
      }
    });

    socket.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
  });
}

function encodeMaskedClientFrame(payload) {
  const mask = crypto.randomBytes(4);
  const header = payload.length < 126
    ? Buffer.from([0x81, 0x80 | payload.length])
    : Buffer.from([0x81, 0xfe, payload.length >> 8, payload.length & 0xff]);
  const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  return Buffer.concat([header, mask, masked]);
}
