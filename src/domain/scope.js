/**
 * 情境（scope）的定義。
 *
 * 情境把帳目分成互不混雜的幾群：日常、各趟旅行、以及常設情境。
 *
 * 為什麼需要這個模組
 * 原本 'domestic' / 'overseas' 這兩個字串硬編碼在 7 個檔案裡 ——
 * 情境清單、行程編輯、圖表篩選、圖表配色、設定頁列表、標籤產生…
 * 每個地方各自寫死 emoji 與判斷式。要新增一種情境就得把這 7 處都找出來改，
 * 漏掉任何一處就是「某個畫面看不到新情境」這種難以察覺的錯誤。
 *
 * 現在所有情境相關的判斷都從這裡衍生，新增一種只需要改這個檔案。
 *
 * 純函式：不碰 DOM、不讀全域狀態。
 */

/**
 * 所有情境類型。
 *
 * isTrip 區分「一次性的旅程」與「持續進行的常設情境」：
 * 旅程有明確起訖、會出現在「各趟旅遊花費」的橫向比較中；
 * 常設情境（孝親費、房貸、寵物開銷…）是長期持續的，
 * 跟一趟旅行放在同一張圖比較沒有意義，因此不納入。
 */
export const SCOPE_KINDS = Object.freeze({
  domestic: Object.freeze({
    key: 'domestic',
    label: '國內旅遊',
    short: '國內',
    emoji: '🚆',
    color: '#0d6e60',
    isTrip: true,
    namePlaceholder: '例如：花蓮 2026',
  }),
  overseas: Object.freeze({
    key: 'overseas',
    label: '出國旅遊',
    short: '出國',
    emoji: '✈️',
    color: '#3269c0',
    isTrip: true,
    namePlaceholder: '例如：四國 2026',
  }),
  standing: Object.freeze({
    key: 'standing',
    label: '常設情境',
    short: '常設',
    emoji: '📌',
    color: '#6f56bd',
    isTrip: false,
    namePlaceholder: '例如：孝親費、房貸、寵物',
  }),
});

/** 依顯示順序排列的所有情境類型。 */
export const SCOPE_KIND_LIST = Object.freeze(Object.values(SCOPE_KINDS));

/** 旅程類的情境類型（有起訖、可橫向比較）。 */
export const TRIP_KINDS = Object.freeze(SCOPE_KIND_LIST.filter((k) => k.isTrip).map((k) => k.key));

/** 常設類的情境類型（長期持續，不納入旅程比較）。 */
export const STANDING_KINDS = Object.freeze(
  SCOPE_KIND_LIST.filter((k) => !k.isTrip).map((k) => k.key),
);

/** 預設的情境類型，用於新增時的初始選取。 */
export const DEFAULT_SCOPE_KIND = 'domestic';

/**
 * 取得某個情境類型的中繼資料。未知類型退回預設類型，避免畫面出現空白。
 * @param {string} kind
 */
export function scopeKindMeta(kind) {
  return SCOPE_KINDS[kind] || SCOPE_KINDS[DEFAULT_SCOPE_KIND];
}

/** 這個類型是不是已知的情境類型。 */
export function isScopeKind(kind) {
  return Object.hasOwn(SCOPE_KINDS, kind);
}

/** 這個類型是不是「一趟旅程」（會出現在旅遊花費比較中）。 */
export function isTripKind(kind) {
  return !!SCOPE_KINDS[kind]?.isTrip;
}

/** 這個類型是不是「常設情境」。 */
export function isStandingKind(kind) {
  return isScopeKind(kind) && !SCOPE_KINDS[kind].isTrip;
}

/**
 * 情境是否為「非日常」——也就是綁定到某個行程或常設情境。
 * @param {{type?: string}} scope
 */
export function isScopedToEntry(scope) {
  return !!scope && isScopeKind(scope.type);
}

/**
 * 行程／常設情境的顯示名稱（含 emoji）。
 * @param {{name?: string, kind?: string}} entry
 */
export function scopeEntryLabel(entry) {
  if (!entry) return '🧳 已刪除情境';
  return `${scopeKindMeta(entry.kind).emoji} ${entry.name || '未命名'}`;
}

/**
 * 取得情境的時間區間。
 *
 * 常設情境通常不設區間（孝親費是持續的），此時回傳 null，
 * 代表「不限時間」而不是「區間為空」—— 兩者在圖表對齊上的意義完全不同。
 *
 * @param {{start?: string, end?: string}} entry
 * @returns {{from: string, to: string}|null}
 */
export function scopeDateRange(entry) {
  if (!entry) return null;
  const from = entry.start || '';
  const to = entry.end || '';
  if (!from && !to) return null;
  // 只填了一端也算有效區間：開始日之後、或結束日之前。
  return { from, to: to || '', ...(from ? {} : { from: '' }) };
}

/**
 * 日期是否落在情境的時間區間內。沒有設定區間時一律視為符合。
 * @param {{start?: string, end?: string}} entry
 * @param {string} date YYYY-MM-DD
 */
export function withinScopeRange(entry, date) {
  const range = scopeDateRange(entry);
  if (!range) return true;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}
