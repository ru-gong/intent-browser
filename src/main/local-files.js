const path = require('node:path');

const HTML_FILE_EXTENSIONS = new Set(['.html', '.htm', '.xhtml']);

function isLocalHtmlFile(filePath) {
  return HTML_FILE_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function htmlOpenDialogOptions(defaultPath, copy = {}) {
  return {
    title: copy.title || 'Open local HTML file',
    defaultPath,
    properties: ['openFile'],
    filters: [
      { name: copy.htmlFiles || 'HTML Files', extensions: ['html', 'htm', 'xhtml'] },
      { name: copy.allFiles || 'All Files', extensions: ['*'] }
    ]
  };
}

module.exports = {
  HTML_FILE_EXTENSIONS,
  htmlOpenDialogOptions,
  isLocalHtmlFile
};
