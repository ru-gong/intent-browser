const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULT_PORT = 17345;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MODE = 'preview';
const VALID_MODES = new Set(['preview', 'quick-edit', 'annotation']);

function parseCliArgs(argv, context = {}) {
  const args = normalizeCliArgs(argv, context);
  const cwd = context.cwd || process.cwd();
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    mode: DEFAULT_MODE,
    width: 1440,
    height: 960
  };
  const positionals = [];
  let command = 'open';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (!arg.startsWith('-') && index === 0 && isCommand(arg)) {
      command = arg;
      continue;
    }
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    const [flag, inlineValue] = arg.split('=', 2);
    const value = () => inlineValue !== undefined ? inlineValue : args[++index];

    switch (flag) {
      case '-h':
      case '--help':
        options.help = true;
        command = 'help';
        break;
      case '-v':
      case '--version':
        options.version = true;
        break;
      case '--url':
        options.url = value();
        break;
      case '--host':
        options.host = value();
        break;
      case '--port':
        options.port = Number(value());
        break;
      case '--out':
        options.out = path.resolve(cwd, value());
        break;
      case '--session':
        options.session = value();
        break;
      case '--mode':
        options.mode = value();
        break;
      case '--devtools':
        options.devtools = true;
        break;
      case '--format':
        options.format = value();
        break;
      case '--since':
        options.since = Number(value());
        break;
      case '--width':
        options.width = Number(value());
        break;
      case '--height':
        options.height = Number(value());
        break;
      case '--no-cdp':
        options.cdp = false;
        break;
      case '--remote-debugging-port':
        options.remoteDebuggingPort = Number(value());
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65535) {
    throw new Error(`Invalid --port: ${options.port}`);
  }
  if (!VALID_MODES.has(options.mode)) {
    throw new Error(`Invalid --mode: ${options.mode}`);
  }
  if (
    options.remoteDebuggingPort !== undefined &&
    (!Number.isInteger(options.remoteDebuggingPort) || options.remoteDebuggingPort <= 0 || options.remoteDebuggingPort > 65535)
  ) {
    throw new Error(`Invalid --remote-debugging-port: ${options.remoteDebuggingPort}`);
  }
  if (command === 'open') {
    options.url = options.url || positionals[0] || defaultSampleUrl(cwd);
    options.url = normalizeTargetUrl(options.url, cwd);
  }

  return { command, options, positionals };
}

function normalizeCliArgs(argv, context = {}) {
  const args = [...argv];
  if (args[0] === '--') {
    args.shift();
  }
  if (args[0] && looksLikeAppPath(args[0], context)) {
    args.shift();
  }
  if (args[0] === '--') {
    args.shift();
  }
  return args;
}

function normalizeTargetUrl(input, cwd = process.cwd()) {
  if (!input) {
    return defaultSampleUrl(cwd);
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input)) {
    return input;
  }
  const absolute = path.resolve(cwd, input);
  return pathToFileURL(absolute).toString();
}

function defaultSampleUrl(cwd = process.cwd()) {
  return normalizeTargetUrl(path.join(__dirname, '..', '..', 'samples', 'demo.html'), cwd);
}

function toHttpUrl(options, pathname) {
  return `http://${options.host || DEFAULT_HOST}:${options.port || DEFAULT_PORT}${pathname}`;
}

function buildHelp() {
  return `Agent Debug Browser

Usage:
  agent-debug-browser [url] [options]
  agent-debug-browser open [url] [options]
  agent-debug-browser read [--port 17345] [--since 0] [--format json|ndjson]
  agent-debug-browser mode <preview|quick-edit|annotation> [--port 17345]
  agent-debug-browser snapshot [--port 17345]

Options:
  --url <url-or-file>       Target page URL or local HTML file.
  --host <host>             RPC host. Default: ${DEFAULT_HOST}
  --port <port>             RPC HTTP/WebSocket port. Default: ${DEFAULT_PORT}
  --out <file>              Append diff payloads as NDJSON for agent ingestion.
  --session <id>            Stable session id to include in payloads.
  --mode <mode>             Initial mode: preview, quick-edit, annotation.
  --devtools                Open DevTools for the target page.
  --width <px>              Initial window width. Default: 1440
  --height <px>             Initial window height. Default: 960
  --no-cdp                  Disable Chrome DevTools Protocol enrichment.
  --remote-debugging-port <port>
                            Expose Chromium remote debugging for smoke tests.
  --version                 Print version.
  --help                    Show this help.

Agent API:
  HTTP  GET  /health
  HTTP  GET  /session
  HTTP  GET  /events?since=<sequence>
  HTTP  GET  /events.ndjson?since=<sequence>
  HTTP  POST /mode       {"mode":"quick-edit"}
  HTTP  POST /navigate   {"url":"http://localhost:3000"}
  WS    /rpc             JSON-RPC 2.0: events.list, session.get, mode.set, page.navigate
`;
}

function isCommand(value) {
  return ['open', 'read', 'mode', 'snapshot', 'help'].includes(value);
}

function looksLikeAppPath(value, context = {}) {
  const basename = path.basename(value);
  if (
    value.endsWith('.js') ||
    value.endsWith('app.asar') ||
    basename === 'agent-debug-browser' ||
    basename === 'agent-debug-browser.js'
  ) {
    return true;
  }
  if (context.appRoot) {
    return path.resolve(context.cwd || process.cwd(), value) === path.resolve(context.appRoot);
  }
  return false;
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_MODE,
  DEFAULT_PORT,
  VALID_MODES,
  buildHelp,
  normalizeCliArgs,
  normalizeTargetUrl,
  parseCliArgs,
  toHttpUrl
};
