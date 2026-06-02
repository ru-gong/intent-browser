const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const chromeJs = fs.readFileSync(path.join(root, 'src', 'renderer', 'chrome.js'), 'utf8');
const chromeCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'chrome.css'), 'utf8');

test('top toolbar controls expose custom hover tooltip text', () => {
  for (const action of ['back', 'forward', 'reload', 'open-file', 'export-ai', 'toggle-panel']) {
    assert.match(chromeJs, new RegExp(`data-action="${action}"[^>]+data-tooltip="`));
  }

  assert.match(chromeJs, /class="go-button"[^>]+data-tooltip="/);
  assert.match(chromeJs, /class="brand-block"[^>]+data-tooltip="/);
  assert.match(chromeJs, /class="endpoint"[^>]+data-tooltip="/);
  assert.match(chromeJs, /class="mode\$\{active\}"[^>]+data-tooltip="/);
  assert.match(chromeJs, /class="toolbar-tooltip"/);
  assert.match(chromeJs, /setupToolbarTooltips\(\)/);
});

test('toolbar tooltip is styled as an in-toolbar floating bubble', () => {
  assert.match(chromeCss, /\.toolbar\s*{[^}]*position: relative;/s);
  assert.match(chromeCss, /\.toolbar-tooltip\s*{[^}]*position: absolute;/s);
  assert.match(chromeCss, /\.toolbar-tooltip\s*{[^}]*border-radius: 999px;/s);
  assert.match(chromeCss, /\.toolbar-tooltip\.is-visible\s*{[^}]*opacity: 1;/s);
});
