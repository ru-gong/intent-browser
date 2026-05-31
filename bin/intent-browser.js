#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');
const process = require('node:process');
const {
  buildHelp,
  normalizeCliArgs,
  parseCliArgs,
  toHttpUrl
} = require('../src/main/cli');

async function main() {
  const argv = process.argv.slice(2);
  const parsed = parseCliArgs(argv, { cwd: process.cwd() });

  if (parsed.command === 'help' || parsed.options.help) {
    process.stdout.write(buildHelp());
    return;
  }

  if (parsed.options.version) {
    const pkg = require('../package.json');
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  if (parsed.command === 'read') {
    await readEvents(parsed);
    return;
  }

  if (parsed.command === 'snapshot') {
    await printJson(await requestJson(parsed, '/session'));
    return;
  }

  if (parsed.command === 'mode') {
    const mode = parsed.positionals[0] || parsed.options.mode;
    if (!mode) {
      throw new Error('Missing mode. Use preview, quick-edit, or annotation.');
    }
    await printJson(await requestJson(parsed, '/mode', {
      method: 'POST',
      body: JSON.stringify({ mode })
    }));
    return;
  }

  const electronBinary = require('electron');
  const appRoot = path.resolve(__dirname, '..');
  const child = spawn(electronBinary, [appRoot, ...normalizeCliArgs(argv)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      AGENT_DEBUG_BROWSER_CWD: process.cwd()
    }
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

async function readEvents(parsed) {
  const since = Number(parsed.options.since || 0);
  const format = parsed.options.format || 'json';
  const endpoint = format === 'ndjson'
    ? `/events.ndjson?since=${encodeURIComponent(String(since))}`
    : `/events?since=${encodeURIComponent(String(since))}`;
  const response = await fetch(toHttpUrl(parsed.options, endpoint));
  if (!response.ok) {
    throw new Error(`Read failed: HTTP ${response.status}`);
  }
  process.stdout.write(await response.text());
  if (format !== 'ndjson') {
    process.stdout.write('\n');
  }
}

async function requestJson(parsed, pathname, init = {}) {
  const response = await fetch(toHttpUrl(parsed.options, pathname), {
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed: HTTP ${response.status} ${body}`);
  }
  return response.json();
}

async function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`intent-browser: ${error.message}\n`);
  process.exit(1);
});
