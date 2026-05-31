const PRODUCT_NAME_EN = 'Intent Browser';
const PRODUCT_NAME_ZH = '灵犀页镜';

function isChineseLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('zh');
}

function productNameForLocale(locale) {
  return isChineseLocale(locale) ? PRODUCT_NAME_ZH : PRODUCT_NAME_EN;
}

function productNameForLocales(locales) {
  const values = Array.isArray(locales) ? locales : [locales];
  return values.some(isChineseLocale) ? PRODUCT_NAME_ZH : PRODUCT_NAME_EN;
}

module.exports = {
  PRODUCT_NAME_EN,
  PRODUCT_NAME_ZH,
  isChineseLocale,
  productNameForLocale,
  productNameForLocales
};
