/* ===== 網站共用服務設定：一般使用者不需輸入 API ===== */
function embeddedKey(name) {
  const raw = (document.querySelector(`meta[name="${name}"]`)?.content || '').trim();
  return !raw || /^PASTE_/i.test(raw) ? '' : raw;
}
const APP_CONFIG = Object.freeze({
  mapsApiKey: embeddedKey('ledger-shared-maps-api-key'),
  visionApiKey: embeddedKey('ledger-shared-vision-api-key'),
  mapsRadiusMeters: 220,
  adminEmail: (document.querySelector('meta[name="ledger-admin-email"]')?.content || '')
    .trim()
    .toLowerCase(),
  advancedAllowlist: (
    document.querySelector('meta[name="ledger-advanced-allowlist"]')?.content || ''
  )
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
});
const normEmail = (e) =>
  String(e || '')
    .trim()
    .toLowerCase();
const isAllowlistedEmail = (e) => APP_CONFIG.advancedAllowlist.includes(normEmail(e));
function currentGoogleEmail() {
  return normEmail(typeof GOOGLE_SYNC !== 'undefined' && GOOGLE_SYNC.user?.emailAddress);
}
function hasAdvancedAccess() {
  const e = currentGoogleEmail();
  return (
    !!e &&
    typeof GOOGLE_SYNC !== 'undefined' &&
    GOOGLE_SYNC.mode === 'google' &&
    isAllowlistedEmail(e)
  );
}
function isSiteAdmin() {
  const e = currentGoogleEmail();
  return (
    !!e &&
    typeof GOOGLE_SYNC !== 'undefined' &&
    GOOGLE_SYNC.mode === 'google' &&
    e === APP_CONFIG.adminEmail
  );
}
function effectiveMapsKey() {
  return hasAdvancedAccess()
    ? APP_CONFIG.mapsApiKey || String(settings?.gmapsKey || '').trim()
    : '';
}
function effectiveVisionKey() {
  return hasAdvancedAccess()
    ? APP_CONFIG.visionApiKey || String(settings?.visionKey || '').trim()
    : '';
}
function safeUserSettings(v) {
  const x = { ...(v && typeof v === 'object' ? v : {}) };
  delete x.gmapsKey;
  delete x.visionKey;
  return x;
}

// v1 遷移已移至 src/core/migrations.js（有版本號、冪等、可單獨測試）。
