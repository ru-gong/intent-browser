const assert = require('node:assert/strict');
const test = require('node:test');
const { buildHelp, normalizeTargetUrl, parseCliArgs } = require('../src/main/cli');

test('parses default open command with URL and options', () => {
  const parsed = parseCliArgs(['open', 'http://localhost:3000', '--port', '18080', '--mode', 'annotation']);
  assert.equal(parsed.command, 'open');
  assert.equal(parsed.options.url, 'http://localhost:3000');
  assert.equal(parsed.options.port, 18080);
  assert.equal(parsed.options.mode, 'annotation');
});

test('normalizes local file targets to file URLs', () => {
  const url = normalizeTargetUrl('samples/demo.html', '/tmp/project');
  assert.match(url, /^file:\/\/\/tmp\/project\/samples\/demo\.html$/);
});

test('drops electron app root before target file', () => {
  const parsed = parseCliArgs(['/tmp/project', 'docs/guide.html', '--port', '19000'], {
    cwd: '/tmp/project',
    appRoot: '/tmp/project'
  });
  assert.equal(parsed.command, 'open');
  assert.equal(parsed.options.url, 'file:///tmp/project/docs/guide.html');
  assert.equal(parsed.options.port, 19000);
});

test('keeps target files whose names contain agent-debug-browser', () => {
  const parsed = parseCliArgs(['docs/agent-debug-browser-guide.html', '--port', '19274'], {
    cwd: '/tmp/project'
  });
  assert.equal(parsed.options.url, 'file:///tmp/project/docs/agent-debug-browser-guide.html');
});

test('parses remote debugging port for smoke tests', () => {
  const parsed = parseCliArgs(['docs/guide.html', '--remote-debugging-port', '19374'], {
    cwd: '/tmp/project'
  });
  assert.equal(parsed.options.remoteDebuggingPort, 19374);
});

test('read command keeps protocol options', () => {
  const parsed = parseCliArgs(['read', '--since', '4', '--format', 'ndjson', '--port', '17777']);
  assert.equal(parsed.command, 'read');
  assert.equal(parsed.options.since, 4);
  assert.equal(parsed.options.format, 'ndjson');
  assert.equal(parsed.options.port, 17777);
});

test('rejects invalid mode', () => {
  assert.throws(() => parseCliArgs(['--mode', 'paint']), /Invalid --mode/);
});

test('help documents agent operations', () => {
  const help = buildHelp();
  assert.match(help, /agent-debug-browser read/);
  assert.match(help, /WS\s+\/rpc/);
  assert.match(help, /mode\.set/);
});
