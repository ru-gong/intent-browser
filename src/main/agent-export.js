const path = require('node:path');
const { PRODUCT_NAME_EN, PRODUCT_NAME_ZH } = require('./product');

const EXPORT_SCHEMA_VERSION = '1.0.0';

function buildAgentExport(sessionSnapshot, events, options = {}) {
  const normalizedEvents = Array.isArray(events) ? events : [];
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: options.exportedAt || new Date().toISOString(),
    product: {
      name: PRODUCT_NAME_EN,
      localizedName: options.localizedName || PRODUCT_NAME_EN,
      chineseName: PRODUCT_NAME_ZH
    },
    purpose: 'agent-diff-handoff',
    session: sessionSnapshot || null,
    eventCount: normalizedEvents.length,
    events: normalizedEvents
  };
}

function agentExportDialogOptions(defaultPath, copy = {}) {
  return {
    title: copy.title || 'Export interactions for AI',
    defaultPath,
    filters: [
      { name: copy.jsonFiles || 'JSON Files', extensions: ['json'] },
      { name: copy.ndjsonFiles || 'NDJSON Files', extensions: ['ndjson'] }
    ]
  };
}

function exportFormatForPath(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() === '.ndjson' ? 'ndjson' : 'json';
}

function serializeAgentExport(exportPayload, format = 'json') {
  if (format === 'ndjson') {
    return (exportPayload.events || []).map((event) => JSON.stringify(event)).join('\n') + '\n';
  }
  return `${JSON.stringify(exportPayload, null, 2)}\n`;
}

function defaultAgentExportPath(baseDir, sessionId) {
  const safeSession = String(sessionId || 'session').replace(/[^a-zA-Z0-9._-]/g, '-');
  return path.join(baseDir || process.cwd(), `intent-browser-diffs-${safeSession}.json`);
}

module.exports = {
  agentExportDialogOptions,
  buildAgentExport,
  defaultAgentExportPath,
  exportFormatForPath,
  serializeAgentExport
};
