/**
 * 儲存層。
 *
 * 唯一負責與 localStorage 溝通的地方。所有讀寫都吞掉例外並降級到記憶體，
 * 讓私密瀏覽模式、配額用盡、站台資料被封鎖等情況不會讓 app 當掉。
 *
 * ⚠️ 已知缺陷（P5 處理）：load() 只防 JSON 解析失敗，不檢查型別。
 *    若 ledger.v2.records 存到「合法 JSON 但不是陣列」的值，
 *    呼叫端會拿到非預期型別而拋錯。詳見 ARCHITECTURE.md。
 *
 * ⚠️ 降級到記憶體時資料不會留存：關掉分頁就消失。
 *    目前是靜默降級，P5 會改成明確警示。
 */

/**
 * localStorage 的鍵名。
 *
 * ⚠️ 改動任何一個等同讓既有使用者的資料消失 —— 這些鍵名已經在使用者的
 *    瀏覽器與 Google Drive 備份裡了。要改格式請走 migrations，不要改鍵名。
 */
export const K = Object.freeze({
  rec: 'ledger.v2.records',
  ce: 'ledger.v2.catsExpense',
  ci: 'ledger.v2.catsIncome',
  pay: 'ledger.v2.payments',
  trips: 'ledger.v2.trips',
  scope: 'ledger.v2.scope',
  set: 'ledger.v2.settings',
  sub: 'ledger.v2.subcats',
  prices: 'ledger.v2.prices',
  twse: 'ledger.v2.twse',
  cc: 'ledger.v2.catColors',
});

/** localStorage 不可用時的後備儲存（僅存在於記憶體）。 */
const memStore = {};

/** localStorage 是否可用。在 Node 環境或私密模式下為 false。 */
export const storageOK = (() => {
  try {
    localStorage.setItem('__t__', '1');
    localStorage.removeItem('__t__');
    return true;
  } catch {
    return false;
  }
})();

/**
 * 讀取一個鍵值，失敗時回傳預設值。
 * @param {string} k 鍵名
 * @param {*} f 預設值
 */
export function load(k, f) {
  try {
    if (!storageOK) return k in memStore ? memStore[k] : f;
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
}

/**
 * 寫入一個鍵值。寫入後會觸發雲端同步掛鉤（若已註冊）。
 * @param {string} k 鍵名
 * @param {*} v 值（會被 JSON 序列化）
 */
export function save(k, v) {
  try {
    if (!storageOK) {
      memStore[k] = v;
    } else {
      localStorage.setItem(k, JSON.stringify(v));
    }
  } catch {
    memStore[k] = v;
  }
  // 由 Google Drive 同步模組註冊，用來排程上傳。
  if (globalThis.__ledgerCloudMutationHook) globalThis.__ledgerCloudMutationHook(k);
}

/** 測試用：清空記憶體後備儲存。 */
export function __resetMemStore() {
  for (const k of Object.keys(memStore)) delete memStore[k];
}
