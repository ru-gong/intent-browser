const { app } = require('electron');
const path = require('node:path');
const { parseCliArgs } = require('./cli');
const { SessionBus } = require('./session');
const { AgentRpcServer } = require('./rpc-server');
const { createWorkbench } = require('./workbench');

let rpcServer = null;
let workbench = null;

function getDockIconPath(appRoot) {
  return path.join(appRoot, 'assets', 'icon.png');
}

async function boot() {
  const appRoot = path.join(__dirname, '..', '..');
  const parsed = parseCliArgs(process.argv.slice(1), {
    cwd: process.env.AGENT_DEBUG_BROWSER_CWD || process.cwd(),
    appRoot
  });

  if (parsed.command !== 'open') {
    return;
  }

  app.setName('Agent Debug Browser');
  app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');
  if (parsed.options.remoteDebuggingPort) {
    app.commandLine.appendSwitch('remote-debugging-port', String(parsed.options.remoteDebuggingPort));
  }
  await app.whenReady();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getDockIconPath(appRoot));
  }

  const session = new SessionBus(parsed.options);
  workbench = createWorkbench(session, parsed.options);
  rpcServer = new AgentRpcServer(session, {
    'mode.set': ({ mode, source }) => workbench.setMode(mode, source || 'rpc'),
    'page.navigate': ({ url }) => workbench.navigate(url)
  }, parsed.options);

  const endpoint = await rpcServer.start();
  workbench.create(endpoint);

  app.on('activate', () => {
    if (!workbench || workbench.isDestroyed()) {
      workbench = createWorkbench(session, parsed.options);
      workbench.create(endpoint);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (rpcServer) {
    rpcServer.close();
  }
});

boot().catch((error) => {
  console.error(error);
  app.exit(1);
});
