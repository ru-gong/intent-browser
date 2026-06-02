const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentDebugChrome', {
  getState: () => ipcRenderer.invoke('adb:chrome:get-state'),
  openLocalFile: () => ipcRenderer.invoke('adb:chrome:open-local-file'),
  exportForAgent: () => ipcRenderer.invoke('adb:chrome:export-for-agent'),
  setPanelVisible: (visible) => ipcRenderer.invoke('adb:chrome:set-panel-visible', visible),
  setMode: (mode) => ipcRenderer.send('adb:chrome:set-mode', mode),
  navigate: (url) => ipcRenderer.send('adb:chrome:navigate', url),
  reload: () => ipcRenderer.send('adb:chrome:reload'),
  back: () => ipcRenderer.send('adb:chrome:back'),
  forward: () => ipcRenderer.send('adb:chrome:forward'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('adb:chrome:state', listener);
    return () => ipcRenderer.off('adb:chrome:state', listener);
  },
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('adb:chrome:event', listener);
    return () => ipcRenderer.off('adb:chrome:event', listener);
  },
  onMetric: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('adb:chrome:metric', listener);
    return () => ipcRenderer.off('adb:chrome:metric', listener);
  },
  onPageReady: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('adb:chrome:page-ready', listener);
    return () => ipcRenderer.off('adb:chrome:page-ready', listener);
  }
});
