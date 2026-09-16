/**
 * 儲存層。
 *
 * 唯一負責與 localStorage 溝通的地方。所有讀寫都吞掉例外並降級到記憶體，
 * 讓私密瀏覽模式、配額用盡、站台資料被封鎖等情況不會讓 app 當掉。
 *
 * 型別驗證由 store.js 在載入時透過 schema.js 執行；
 * 無法使用的值會被送進隔離區（見 quarantine），而不是被丟棄。
 *
 * 降級到記憶體時資料不會留存（關掉分頁就消失），
 * 此時 storageOK 為 false，設定頁會顯示警示。
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

/** 隔離區鍵名的前綴。 */
export const QUARANTINE_PREFIX = 'ledger.quarantine.';

/**
 * 把無法使用的原始值搬進隔離區，而不是丟棄。
 *
 * 這些是使用者累積多年的帳本資料。就算目前的程式碼看不懂它，
 * 也不該直接刪掉 —— 保留下來才有機會人工檢視或寫遷移救回。
 *
 * @param {string} key 原本的儲存鍵名
 * @param {*} value 無法使用的原始值
 * @param {string} reason 隔離原因，供日後判讀
 * @returns {string|null} 隔離區的鍵名；寫入失敗時為 null
 */
export function quarantine(key, value, reason) {
  const qKey = `${QUARANTINE_PREFIX}${key}.${Date.now()}`;
  try {
    const payload = { key, reason, at: new Date().toISOString(), value };
    if (storageOK) localStorage.setItem(qKey, JSON.stringify(payload));
    else memStore[qKey] = payload;
    return qKey;
  } catch {
    // 配額不足等情況下寫不進去。此時原值仍留在它原本的鍵上
    // （呼叫端只是不採用它，不會覆蓋），所以資料還在。
    return null;
  }
}

/** 列出隔離區中的所有項目。 */
export function listQuarantine() {
  const keys = [];
  try {
    if (storageOK) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(QUARANTINE_PREFIX)) keys.push(k);
      }
    } else {
      keys.push(...Object.keys(memStore).filter((k) => k.startsWith(QUARANTINE_PREFIX)));
    }
  } catch {
    return [];
  }
  // quarantineKey 是隔離區的鍵名，payload 裡的 key 是資料原本的鍵名 —— 兩者不同，不可混用。
  return keys.sort().map((k) => ({ quarantineKey: k, ...load(k, {}) }));
}

/** 測試用：清空記憶體後備儲存。 */
export function __resetMemStore() {
  for (const k of Object.keys(memStore)) delete memStore[k];
}
