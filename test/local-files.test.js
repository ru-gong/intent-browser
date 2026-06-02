const assert = require('node:assert/strict');
const test = require('node:test');
const { htmlOpenDialogOptions, isLocalHtmlFile } = require('../src/main/local-files');

test('recognizes local HTML file extensions case-insensitively', () => {
  assert.equal(isLocalHtmlFile('/tmp/page.html'), true);
  assert.equal(isLocalHtmlFile('/tmp/page.HTM'), true);
  assert.equal(isLocalHtmlFile('/tmp/page.xhtml'), true);
  assert.equal(isLocalHtmlFile('/tmp/page.txt'), false);
  assert.equal(isLocalHtmlFile('/tmp/page'), false);
});

test('builds localized HTML open dialog options', () => {
  const options = htmlOpenDialogOptions('/tmp/project', {
    title: '打开本地 HTML 文件',
    htmlFiles: 'HTML 文件',
    allFiles: '所有文件'
  });

  assert.equal(options.title, '打开本地 HTML 文件');
  assert.equal(options.defaultPath, '/tmp/project');
  assert.deepEqual(options.properties, ['openFile']);
  assert.deepEqual(options.filters, [
    { name: 'HTML 文件', extensions: ['html', 'htm', 'xhtml'] },
    { name: '所有文件', extensions: ['*'] }
  ]);
});
