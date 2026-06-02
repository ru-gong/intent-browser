const assert = require('node:assert/strict');
const test = require('node:test');
const {
  agentExportDialogOptions,
  buildAgentExport,
  defaultAgentExportPath,
  exportFormatForPath,
  serializeAgentExport
} = require('../src/main/agent-export');

test('builds an AI handoff payload with session and events', () => {
  const payload = buildAgentExport(
    { sessionId: 's-1', eventCount: 1 },
    [{ sequence: 1, action: 'annotation.create' }],
    { exportedAt: '2026-06-02T00:00:00.000Z', localizedName: '灵犀页镜' }
  );

  assert.equal(payload.schemaVersion, '1.0.0');
  assert.equal(payload.purpose, 'agent-diff-handoff');
  assert.equal(payload.product.name, 'Intent Browser');
  assert.equal(payload.product.localizedName, '灵犀页镜');
  assert.equal(payload.exportedAt, '2026-06-02T00:00:00.000Z');
  assert.equal(payload.session.sessionId, 's-1');
  assert.equal(payload.eventCount, 1);
  assert.equal(payload.events[0].action, 'annotation.create');
});

test('serializes AI handoff payloads as JSON and event NDJSON', () => {
  const payload = buildAgentExport(
    { sessionId: 's-2' },
    [
      { sequence: 1, action: 'text.replace' },
      { sequence: 2, action: 'style.update' }
    ],
    { exportedAt: '2026-06-02T00:00:00.000Z' }
  );

  assert.equal(JSON.parse(serializeAgentExport(payload, 'json')).eventCount, 2);
  const lines = serializeAgentExport(payload, 'ndjson').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((event) => event.action), ['text.replace', 'style.update']);
});

test('detects export format and builds localized save dialog options', () => {
  assert.equal(exportFormatForPath('/tmp/diffs.ndjson'), 'ndjson');
  assert.equal(exportFormatForPath('/tmp/diffs.json'), 'json');
  assert.equal(exportFormatForPath('/tmp/diffs'), 'json');

  const defaultPath = defaultAgentExportPath('/tmp/project', 'adb:demo/id');
  assert.match(defaultPath, /intent-browser-diffs-adb-demo-id\.json$/);

  const options = agentExportDialogOptions(defaultPath, {
    title: '导出给 AI',
    jsonFiles: 'JSON 文件',
    ndjsonFiles: 'NDJSON 文件'
  });
  assert.equal(options.title, '导出给 AI');
  assert.equal(options.defaultPath, defaultPath);
  assert.deepEqual(options.filters, [
    { name: 'JSON 文件', extensions: ['json'] },
    { name: 'NDJSON 文件', extensions: ['ndjson'] }
  ]);
});
