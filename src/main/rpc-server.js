const crypto = require('node:crypto');
const http = require('node:http');
const { URL } = require('node:url');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class AgentRpcServer {
  constructor(session, handlers = {}, options = {}) {
    this.session = session;
    this.handlers = handlers;
    this.host = options.host || '127.0.0.1';
    this.port = options.port ?? 17345;
    this.clients = new Set();
    this.server = http.createServer((request, response) => {
      this.handleHttp(request, response).catch((error) => {
        sendJson(response, 500, { error: error.message });
      });
    });
    this.server.on('upgrade', (request, socket) => this.handleUpgrade(request, socket));
    this.session.on('diff', (event) => {
      this.broadcastJson({ jsonrpc: '2.0', method: 'diff', params: event });
    });
    this.session.on('mode', (event) => {
      this.broadcastJson({ jsonrpc: '2.0', method: 'mode', params: event });
    });
    this.session.on('state', (state) => {
      this.broadcastJson({ jsonrpc: '2.0', method: 'session', params: state });
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        resolve({
          host: this.host,
          port: this.server.address().port,
          httpUrl: `http://${this.host}:${this.server.address().port}`,
          wsUrl: `ws://${this.host}:${this.server.address().port}/rpc`
        });
      });
    });
  }

  close() {
    for (const client of this.clients) {
      client.destroy();
    }
    return new Promise((resolve) => this.server.close(resolve));
  }

  async handleHttp(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || `${this.host}:${this.port}`}`);
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, session: this.session.snapshot() });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/session') {
      sendJson(response, 200, this.session.snapshot());
      return;
    }
    if (request.method === 'GET' && url.pathname === '/events') {
      sendJson(response, 200, {
        events: this.session.listEvents(Number(url.searchParams.get('since') || 0)),
        session: this.session.snapshot()
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/events.ndjson') {
      const events = this.session.listEvents(Number(url.searchParams.get('since') || 0));
      response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
      response.end(events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : ''));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/mode') {
      const body = await readJsonBody(request);
      const result = await this.callHandler('mode.set', { mode: body.mode, source: 'http' });
      sendJson(response, 200, result);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/navigate') {
      const body = await readJsonBody(request);
      const result = await this.callHandler('page.navigate', { url: body.url, source: 'http' });
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  }

  handleUpgrade(request, socket) {
    const url = new URL(request.url, `http://${request.headers.host || `${this.host}:${this.port}`}`);
    if (url.pathname !== '/rpc') {
      socket.destroy();
      return;
    }
    const key = request.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n'));
    socket._adbBuffer = Buffer.alloc(0);
    this.clients.add(socket);
    socket.on('data', (chunk) => this.handleWsData(socket, chunk));
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
    sendWsJson(socket, { jsonrpc: '2.0', method: 'session', params: this.session.snapshot() });
  }

  handleWsData(socket, chunk) {
    socket._adbBuffer = Buffer.concat([socket._adbBuffer, chunk]);
    let parsed;
    while ((parsed = parseWsFrame(socket._adbBuffer))) {
      socket._adbBuffer = socket._adbBuffer.slice(parsed.consumed);
      if (parsed.opcode === 0x8) {
        socket.end();
        return;
      }
      if (parsed.opcode !== 0x1) {
        continue;
      }
      this.handleJsonRpc(socket, parsed.payload.toString('utf8')).catch((error) => {
        sendWsJson(socket, makeError(null, -32000, error.message));
      });
    }
  }

  async handleJsonRpc(socket, text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (error) {
      sendWsJson(socket, makeError(null, -32700, 'Parse error'));
      return;
    }
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      sendWsJson(socket, makeError(message && message.id, -32600, 'Invalid Request'));
      return;
    }
    try {
      const result = await this.callHandler(message.method, message.params || {});
      if (message.id !== undefined) {
        sendWsJson(socket, { jsonrpc: '2.0', id: message.id, result });
      }
    } catch (error) {
      sendWsJson(socket, makeError(message.id, -32603, error.message));
    }
  }

  async callHandler(method, params) {
    if (method === 'events.list') {
      return {
        events: this.session.listEvents(Number(params.since || 0)),
        session: this.session.snapshot()
      };
    }
    if (method === 'session.get') {
      return this.session.snapshot();
    }
    const handler = this.handlers[method];
    if (!handler) {
      throw new Error(`Method not found: ${method}`);
    }
    return handler(params);
  }

  broadcastJson(message) {
    for (const client of this.clients) {
      sendWsJson(client, message);
    }
  }
}

function parseWsFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) === 0x80;
  let length = second & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    length = high * 2 ** 32 + low;
    offset += 8;
  }
  const maskOffset = offset;
  if (masked) {
    offset += 4;
  }
  if (buffer.length < offset + length) {
    return null;
  }
  let payload = buffer.slice(offset, offset + length);
  if (masked) {
    const mask = buffer.slice(maskOffset, maskOffset + 4);
    payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  }
  return {
    opcode,
    payload,
    consumed: offset + length
  };
}

function sendWsJson(socket, message) {
  if (socket.destroyed) {
    return;
  }
  socket.write(encodeWsFrame(Buffer.from(JSON.stringify(message), 'utf8')));
}

function encodeWsFrame(payload) {
  const length = payload.length;
  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }
  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeUInt32BE(0, 2);
  header.writeUInt32BE(length, 6);
  return Buffer.concat([header, payload]);
}

function makeError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body, null, 2));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8') || '{}';
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

module.exports = {
  AgentRpcServer,
  encodeWsFrame,
  parseWsFrame
};
