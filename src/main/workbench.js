const path = require('node:path');
const fs = require('node:fs/promises');
const { fileURLToPath } = require('node:url');
const { BaseWindow, WebContentsView, ipcMain, dialog } = require('electron');
const {
  agentExportDialogOptions,
  buildAgentExport,
  defaultAgentExportPath,
  exportFormatForPath,
  serializeAgentExport
} = require('./agent-export');
const { normalizeTargetUrl } = require('./cli');
const { htmlOpenDialogOptions, isLocalHtmlFile } = require('./local-files');
const { PRODUCT_NAME_EN, PRODUCT_NAME_ZH } = require('./product');

const TOOLBAR_HEIGHT = 64;
const PANEL_WIDTH = 320;
const TARGET_MARGIN = 12;
const TARGET_PANEL_GAP = 12;
let activeWorkbench = null;
let globalIpcInstalled = false;

function getRuntimeIconPath() {
  const filename = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, '..', '..', 'assets', filename);
}

function installGlobalIpcHandlers() {
  if (globalIpcInstalled) {
    return;
  }
  globalIpcInstalled = true;
  ipcMain.handle('adb:chrome:get-state', () => activeWorkbench && activeWorkbench.getState());
  ipcMain.handle('adb:chrome:open-local-file', () => activeWorkbench && activeWorkbench.openLocalFile());
  ipcMain.handle('adb:chrome:export-for-agent', () => activeWorkbench && activeWorkbench.exportForAgent());
  ipcMain.handle('adb:chrome:set-panel-visible', (_event, visible) => {
    return activeWorkbench && activeWorkbench.setPanelVisible(visible);
  });
  ipcMain.on('adb:chrome:set-mode', (_event, mode) => activeWorkbench && activeWorkbench.setMode(mode, 'toolbar'));
  ipcMain.on('adb:chrome:navigate', (_event, url) => activeWorkbench && activeWorkbench.navigate(url));
  ipcMain.on('adb:chrome:reload', () => activeWorkbench && activeWorkbench.reload());
  ipcMain.on('adb:chrome:back', () => activeWorkbench && activeWorkbench.back());
  ipcMain.on('adb:chrome:forward', () => activeWorkbench && activeWorkbench.forward());
  ipcMain.on('adb:target:ready', (event, page) => activeWorkbench && activeWorkbench.targetReady(event, page));
  ipcMain.on('adb:target:mode-applied', (event, metric) => activeWorkbench && activeWorkbench.modeApplied(event, metric));
  ipcMain.on('adb:target:diff', (event, payload) => activeWorkbench && activeWorkbench.targetDiff(event, payload));
}

function createWorkbench(session, options = {}) {
  let win = null;
  let toolbarView = null;
  let panelView = null;
  let targetView = null;
  let endpoint = null;
  let cdpReady = false;
  let pendingModeRequest = null;
  let panelVisible = options.panelVisible !== false;

  function create(nextEndpoint) {
    endpoint = nextEndpoint;
    win = new BaseWindow({
      width: options.width || 1440,
      height: options.height || 960,
      minWidth: 1024,
      minHeight: 720,
      title: options.productName || PRODUCT_NAME_EN,
      backgroundColor: '#111316',
      icon: getRuntimeIconPath()
    });

    toolbarView = createChromeView('toolbar');
    panelView = createChromeView('panel');
    targetView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'target-preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        devTools: true,
        navigateOnDragDrop: false
      }
    });

    win.contentView.addChildView(targetView);
    win.contentView.addChildView(toolbarView);
    win.contentView.addChildView(panelView);

    installIpcHandlers();
    bindTargetEvents();
    bindChromeEvents();
    layout();

    win.on('resize', layout);
    win.on('closed', () => {
      for (const view of [toolbarView, panelView, targetView]) {
        if (view && !view.webContents.isDestroyed()) {
          view.webContents.close();
        }
      }
      win = null;
      toolbarView = null;
      panelView = null;
      targetView = null;
      if (activeWorkbench && activeWorkbench.sessionId === session.id) {
        activeWorkbench = null;
      }
    });

    targetView.webContents.loadURL(options.url);
    session.setUrl(options.url);
    if (options.devtools) {
      targetView.webContents.once('did-finish-load', () => {
        targetView.webContents.openDevTools({ mode: 'detach' });
      });
    }

    broadcastState();
    return win;
  }

  function createChromeView(role) {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'chrome-preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        devTools: true
      }
    });
    view.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'chrome.html'), {
      query: { role }
    });
    return view;
  }

  function layout() {
    if (!win || !targetView || !toolbarView || !panelView) {
      return;
    }
    const bounds = win.getContentBounds();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const panelWidth = panelVisible ? Math.min(PANEL_WIDTH, Math.max(280, width - 360)) : 0;
    const targetHeight = Math.max(1, height - TOOLBAR_HEIGHT - TARGET_MARGIN * 2);
    const targetWidth = panelVisible
      ? Math.max(320, width - panelWidth - TARGET_MARGIN - TARGET_PANEL_GAP)
      : Math.max(320, width - TARGET_MARGIN * 2);
    toolbarView.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
    panelView.setBounds({
      x: panelVisible ? Math.max(0, width - panelWidth) : width,
      y: TOOLBAR_HEIGHT,
      width: panelVisible ? panelWidth : 1,
      height: Math.max(1, height - TOOLBAR_HEIGHT)
    });
    targetView.setBounds({
      x: TARGET_MARGIN,
      y: TOOLBAR_HEIGHT + TARGET_MARGIN,
      width: targetWidth,
      height: targetHeight
    });
  }

  function bindTargetEvents() {
    targetView.webContents.on('did-navigate', (_event, url) => session.setUrl(url));
    targetView.webContents.on('did-navigate-in-page', (_event, url) => session.setUrl(url));
    targetView.webContents.on('did-finish-load', () => {
      session.setUrl(targetView.webContents.getURL());
      attachCdp();
      setMode(session.mode, 'navigation');
    });
    targetView.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`Target preload failed: ${preloadPath}`, error);
    });
  }

  function bindChromeEvents() {
    for (const view of [toolbarView, panelView]) {
      view.webContents.on('did-finish-load', broadcastState);
      view.webContents.on('preload-error', (_event, preloadPath, error) => {
        console.error(`Chrome preload failed: ${preloadPath}`, error);
      });
    }
    session.on('diff', (event) => sendChrome('adb:chrome:event', event));
    session.on('mode', () => broadcastState());
    session.on('state', broadcastState);
    session.on('metric', (metric) => sendChrome('adb:chrome:metric', metric));
  }

  function installIpcHandlers() {
    activeWorkbench = {
      sessionId: session.id,
      getState,
      openLocalFile,
      exportForAgent,
      setPanelVisible,
      setMode,
      navigate,
      reload: () => targetView && targetView.webContents.reload(),
      back: () => targetView && canGoBack() && goBack(),
      forward: () => targetView && canGoForward() && goForward(),
      targetReady: (event, page) => {
        if (!isTargetSender(event.sender)) return;
        sendChrome('adb:chrome:page-ready', page);
        setMode(session.mode, 'target-ready');
      },
      modeApplied: (event, metric) => {
        if (!isTargetSender(event.sender)) return;
        const requestedAt = pendingModeRequest && pendingModeRequest.mode === metric.mode
          ? pendingModeRequest.requestedAt
          : metric.requestedAt;
        session.recordModeApplied({
          ...metric,
          requestedAt,
          latencyMs: metric.latencyMs || 0
        });
      },
      targetDiff: async (event, payload) => {
        if (!isTargetSender(event.sender)) return;
        const enriched = await enrichWithCdp(payload);
        session.addDiff(enriched);
      }
    };
    installGlobalIpcHandlers();
  }

  function isTargetSender(sender) {
    return targetView && sender.id === targetView.webContents.id;
  }

  function getState() {
    return {
      ...session.snapshot(),
      endpoint,
      ui: {
        panelVisible
      },
      target: {
        canGoBack: canGoBack(),
        canGoForward: canGoForward(),
        title: targetView ? targetView.webContents.getTitle() : ''
      }
    };
  }

  function canGoBack() {
    if (!targetView) return false;
    const history = targetView.webContents.navigationHistory;
    return history ? history.canGoBack() : targetView.webContents.canGoBack();
  }

  function canGoForward() {
    if (!targetView) return false;
    const history = targetView.webContents.navigationHistory;
    return history ? history.canGoForward() : targetView.webContents.canGoForward();
  }

  function goBack() {
    const history = targetView.webContents.navigationHistory;
    if (history) {
      history.goBack();
    } else {
      targetView.webContents.goBack();
    }
  }

  function goForward() {
    const history = targetView.webContents.navigationHistory;
    if (history) {
      history.goForward();
    } else {
      targetView.webContents.goForward();
    }
  }

  function broadcastState() {
    sendChrome('adb:chrome:state', getState());
  }

  function sendChrome(channel, payload) {
    for (const view of [toolbarView, panelView]) {
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.send(channel, payload);
      }
    }
  }

  async function setMode(mode, source = 'api') {
    const notification = session.setMode(mode, source);
    pendingModeRequest = {
      mode,
      requestedAt: Date.now()
    };
    if (targetView && !targetView.webContents.isDestroyed()) {
      targetView.webContents.send('adb:set-mode', {
        mode,
        requestedAt: pendingModeRequest.requestedAt
      });
    }
    return { ok: true, ...notification, session: session.snapshot() };
  }

  async function navigate(inputUrl) {
    if (!inputUrl) {
      throw new Error('Missing url');
    }
    const url = normalizeTargetUrl(inputUrl, process.env.AGENT_DEBUG_BROWSER_CWD || process.cwd());
    session.setUrl(url);
    if (targetView && !targetView.webContents.isDestroyed()) {
      await targetView.webContents.loadURL(url);
    }
    return { ok: true, url, session: session.snapshot() };
  }

  async function openLocalFile() {
    const currentFilePath = currentLocalFilePath();
    const copy = localFileCopy();
    const result = await dialog.showOpenDialog(htmlOpenDialogOptions(
      currentFilePath || process.env.AGENT_DEBUG_BROWSER_CWD || process.cwd(),
      copy.dialog
    ));
    if (result.canceled || !result.filePaths.length) {
      return { ok: false, canceled: true, session: session.snapshot() };
    }
    const filePath = result.filePaths[0];
    if (!isLocalHtmlFile(filePath)) {
      await dialog.showMessageBox({
        type: 'warning',
        buttons: [copy.invalid.ok],
        title: options.productName || PRODUCT_NAME_EN,
        message: copy.invalid.message,
        detail: copy.invalid.detail
      });
      return { ok: false, canceled: false, reason: 'unsupported-file', session: session.snapshot() };
    }
    return navigate(filePath);
  }

  async function exportForAgent() {
    const copy = agentExportCopy();
    const events = session.listEvents(0);
    if (!events.length) {
      await dialog.showMessageBox({
        type: 'info',
        buttons: [copy.empty.ok],
        title: options.productName || PRODUCT_NAME_EN,
        message: copy.empty.message,
        detail: copy.empty.detail
      });
      return { ok: false, reason: 'empty', session: getState() };
    }

    const result = await dialog.showSaveDialog(agentExportDialogOptions(
      defaultAgentExportPath(process.env.AGENT_DEBUG_BROWSER_CWD || process.cwd(), session.id),
      copy.dialog
    ));
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true, session: getState() };
    }

    const format = exportFormatForPath(result.filePath);
    const exportPayload = buildAgentExport(session.snapshot(), events, {
      localizedName: options.productName || PRODUCT_NAME_EN
    });
    await fs.writeFile(result.filePath, serializeAgentExport(exportPayload, format), 'utf8');
    await dialog.showMessageBox({
      type: 'info',
      buttons: [copy.saved.ok],
      title: options.productName || PRODUCT_NAME_EN,
      message: copy.saved.message,
      detail: `${copy.saved.detailPrefix}${result.filePath}`
    });

    return {
      ok: true,
      filePath: result.filePath,
      format,
      eventCount: events.length,
      session: getState()
    };
  }

  function setPanelVisible(visible) {
    panelVisible = Boolean(visible);
    layout();
    broadcastState();
    return { ok: true, panelVisible, session: getState() };
  }

  function localFileCopy() {
    if (options.productName === PRODUCT_NAME_ZH) {
      return {
        dialog: {
          title: '打开本地 HTML 文件',
          htmlFiles: 'HTML 文件',
          allFiles: '所有文件'
        },
        invalid: {
          ok: '知道了',
          message: '请选择 HTML 文件',
          detail: '灵犀页镜支持打开 .html、.htm 和 .xhtml 文件。'
        }
      };
    }
    return {
      dialog: {
        title: 'Open local HTML file',
        htmlFiles: 'HTML Files',
        allFiles: 'All Files'
      },
      invalid: {
        ok: 'OK',
        message: 'Choose an HTML file',
        detail: 'Intent Browser can open .html, .htm, and .xhtml files.'
      }
    };
  }

  function agentExportCopy() {
    if (options.productName === PRODUCT_NAME_ZH) {
      return {
        dialog: {
          title: '导出给 AI',
          jsonFiles: 'JSON 文件',
          ndjsonFiles: 'NDJSON 文件'
        },
        empty: {
          ok: '知道了',
          message: '当前没有可导出的用户操作',
          detail: '请先在快捷编辑或批注模式中完成一次编辑、拖拽或批注，再导出给 AI。'
        },
        saved: {
          ok: '完成',
          message: '已导出给 AI',
          detailPrefix: '文件位置：'
        }
      };
    }
    return {
      dialog: {
        title: 'Export to AI',
        jsonFiles: 'JSON Files',
        ndjsonFiles: 'NDJSON Files'
      },
      empty: {
        ok: 'OK',
        message: 'No user operations to export',
        detail: 'Make at least one quick edit, drag, or annotation before exporting for AI.'
      },
      saved: {
        ok: 'Done',
        message: 'Exported for AI',
        detailPrefix: 'File: '
      }
    };
  }

  function currentLocalFilePath() {
    if (!session.url || !session.url.startsWith('file://')) {
      return null;
    }
    try {
      return fileURLToPath(session.url);
    } catch (_error) {
      return null;
    }
  }

  async function attachCdp() {
    if (options.cdp === false || !targetView || targetView.webContents.debugger.isAttached()) {
      cdpReady = targetView && targetView.webContents.debugger.isAttached();
      return;
    }
    try {
      targetView.webContents.debugger.attach('1.3');
      await targetView.webContents.debugger.sendCommand('DOM.enable');
      cdpReady = true;
    } catch (error) {
      cdpReady = false;
      sendChrome('adb:chrome:metric', {
        type: 'cdp-unavailable',
        message: error.message
      });
    }
  }

  async function enrichWithCdp(payload) {
    if (!cdpReady || !targetView || targetView.webContents.isDestroyed()) {
      return payload;
    }
    const point = payload.interaction && payload.interaction.point && payload.interaction.point.viewport;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return payload;
    }
    try {
      const node = await targetView.webContents.debugger.sendCommand('DOM.getNodeForLocation', {
        x: Math.round(point.x),
        y: Math.round(point.y),
        includeUserAgentShadowDOM: true,
        ignorePointerEventsNone: true
      });
      return {
        ...payload,
        target: {
          ...(payload.target || {}),
          cdp: node
        }
      };
    } catch (error) {
      return {
        ...payload,
        target: {
          ...(payload.target || {}),
          cdpError: error.message
        }
      };
    }
  }

  return {
    create,
    isDestroyed: () => !win || win.isDestroyed(),
    navigate,
    setMode
  };
}

module.exports = {
  createWorkbench
};
