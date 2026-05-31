const crypto = require('node:crypto');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

class SessionBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.id = options.session || `adb-${crypto.randomUUID()}`;
    this.mode = options.mode || 'preview';
    this.url = options.url || '';
    this.out = options.out || null;
    this.events = [];
    this.metrics = {
      modeSwitches: []
    };
    this.startedAt = new Date().toISOString();
    if (this.out) {
      fs.mkdirSync(path.dirname(this.out), { recursive: true });
    }
  }

  snapshot() {
    return {
      schemaVersion: '1.0.0',
      sessionId: this.id,
      mode: this.mode,
      url: this.url,
      startedAt: this.startedAt,
      eventCount: this.events.length,
      lastSequence: this.events.length ? this.events[this.events.length - 1].sequence : 0,
      metrics: this.metrics
    };
  }

  listEvents(since = 0) {
    const min = Number(since) || 0;
    return this.events.filter((event) => event.sequence > min);
  }

  setMode(mode, source = 'api') {
    if (!['preview', 'quick-edit', 'annotation'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    const changed = this.mode !== mode;
    this.mode = mode;
    const notification = {
      schemaVersion: '1.0.0',
      type: 'mode',
      mode,
      source,
      changed,
      timestamp: new Date().toISOString()
    };
    this.emit('mode', notification);
    this.emit('state', this.snapshot());
    return notification;
  }

  setUrl(url) {
    this.url = url;
    this.emit('state', this.snapshot());
  }

  recordModeApplied(metric) {
    const entry = {
      mode: metric.mode,
      latencyMs: Number(metric.latencyMs.toFixed(2)),
      requestedAt: metric.requestedAt || null,
      appliedAt: new Date().toISOString()
    };
    this.metrics.modeSwitches.push(entry);
    if (this.metrics.modeSwitches.length > 30) {
      this.metrics.modeSwitches.shift();
    }
    this.emit('metric', entry);
    this.emit('state', this.snapshot());
    return entry;
  }

  addDiff(payload) {
    const event = {
      schemaVersion: '1.0.0',
      eventId: payload.eventId || crypto.randomUUID(),
      sessionId: this.id,
      sequence: this.events.length + 1,
      timestamp: payload.timestamp || new Date().toISOString(),
      ...payload
    };
    event.sessionId = this.id;
    event.sequence = this.events.length + 1;
    event.schemaVersion = '1.0.0';

    this.events.push(event);
    if (this.out) {
      fs.appendFileSync(this.out, `${JSON.stringify(event)}\n`);
    }
    this.emit('diff', event);
    this.emit('state', this.snapshot());
    return event;
  }
}

module.exports = {
  SessionBus
};
