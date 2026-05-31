const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PRODUCT_NAME_EN,
  PRODUCT_NAME_ZH,
  productNameForLocale,
  productNameForLocales
} = require('../src/main/product');

test('uses Chinese product name for Chinese locales', () => {
  assert.equal(productNameForLocale('zh-CN'), PRODUCT_NAME_ZH);
  assert.equal(productNameForLocale('zh-Hant-TW'), PRODUCT_NAME_ZH);
});

test('uses English product name for non-Chinese locales', () => {
  assert.equal(productNameForLocale('en-US'), PRODUCT_NAME_EN);
  assert.equal(productNameForLocale('ja-JP'), PRODUCT_NAME_EN);
});

test('uses Chinese product name if any preferred locale is Chinese', () => {
  assert.equal(productNameForLocales(['en-US', 'zh-CN']), PRODUCT_NAME_ZH);
});
