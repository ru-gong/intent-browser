const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SessionBus } = require('../src/main/session');

test('records sequenced diff payloads and filters by sequence', () => {
  const session = new SessionBus({ session: 's-1', mode: 'preview', url: 'http://example.test' });
  const first = session.addDiff({ action: 'text.replace', change: { before: 'a', after: 'b' } });
  const second = session.addDiff({ action: 'annotation.create', change: { text: 'fix spacing' } });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.sessionId, 's-1');
  assert.deepEqual(session.listEvents(1).map((event) => event.sequence), [2]);
  assert.equal(session.snapshot().eventCount, 2);
});

test('persists NDJSON output when configured', () => {
  const out = path.join(os.tmpdir(), `adb-${Date.now()}.ndjson`);
  const session = new SessionBus({ session: 's-out', out });
  session.addDiff({ action: 'style.update', change: { property: 'width', before: '10px', after: '20px' } });

  const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).action, 'style.update');
});

test('tracks mode transitions and latency metrics', () => {
  const session = new SessionBus({ session: 's-mode' });
  const mode = session.setMode('quick-edit', 'test');
  const metric = session.recordModeApplied({ mode: 'quick-edit', latencyMs: 12.3456 });

  assert.equal(mode.mode, 'quick-edit');
  assert.equal(session.snapshot().mode, 'quick-edit');
  assert.equal(metric.latencyMs, 12.35);
});
