/**
 * 應用程式狀態容器。
 *
 * 收攏所有「有持久化、跨模組共享」的狀態。原本這些是 11 個頂層 `let`，
 * 任何函式都能直接讀寫，因此改動的波及範圍無法靜態推斷 ——
 * 這正是「改 A 壞 B」的來源之一。
 *
 * 現在所有讀寫都經過這裡，並可被訂閱。
 *
 * 過渡期做法（P4a）
 * `installGlobals()` 會為每個鍵在 globalThis 上定義 getter/setter，
 * 讓 src/legacy/ 裡既有的 `records = x`、`settings.osm` 等寫法原封不動繼續運作，
 * 但實際讀寫都落到 store 上。這讓 P4a 不必改動數百處讀取點。
 * P4b 把 UI 拆成模組後，那些模組改為明確 import，屆時移除全域存取器。
 *
 * ⚠️ 存取器只攔得到「重新賦值」，攔不到「就地修改」。
 *    `records = [...]` 會通知訂閱者；`records.push(x)` 不會。
 *    就地修改後請呼叫 touch('records')。P4b 會把這點納入渲染訂閱的設計。
 */
import { K, load, save } from './storage.js';

/**
 * 受管理的狀態：鍵 → { storageKey, default }。
 * default 為函式時每次取用都會產生新的實例，避免共用同一個物件。
 */
const SCHEMA = Object.freeze({
  records: { storageKey: K.rec, default: () => [] },
  catsExpense: { storageKey: K.ce, default: () => [] },
  catsIncome: { storageKey: K.ci, default: () => [] },
  payments: { storageKey: K.pay, default: () => [] },
  subcats: { storageKey: K.sub, default: () => ({}) },
  prices: { storageKey: K.prices, default: () => ({}) },
  twseCache: { storageKey: K.twse, default: () => null },
  catColors: { storageKey: K.cc, default: () => ({}) },
  trips: { storageKey: K.trips, default: () => [] },
  currentScope: { storageKey: K.scope, default: () => ({ type: 'daily', trip: null }) },
  settings: {
    storageKey: K.set,
    default: () => ({
      osm: false,
      gmapsKey: '',
      visionKey: '',
      financeSheetId: '',
      storeChains: [],
      mrtRecentPairs: [],
    }),
  },
});

/** 受管理的狀態鍵。 */
export const STATE_KEYS = Object.freeze(Object.keys(SCHEMA));

/** 目前的狀態值。 */
const state = Object.create(null);

/** 訂閱者。每次狀態變動時以變動的鍵名呼叫。 */
const listeners = new Set();

/** 是否已從儲存層載入過。 */
let initialized = false;

/**
 * 從 localStorage 載入所有狀態。重複呼叫會重新載入（測試用）。
 */
export function initStore() {
  for (const [key, { storageKey, default: mkDefault }] of Object.entries(SCHEMA)) {
    state[key] = load(storageKey, mkDefault());
  }
  initialized = true;
}

/** 取得一個狀態值。 */
export function get(key) {
  if (!(key in SCHEMA)) throw new Error(`store 沒有這個鍵：${key}`);
  if (!initialized) initStore();
  return state[key];
}

/**
 * 設定一個狀態值並通知訂閱者。
 *
 * 注意：這裡「不會」自動寫入 localStorage。持久化仍由呼叫端明確執行
 * （legacy 目前是 `save(K.rec, records)`），以免每次暫時性的變動都打到儲存層。
 * 統一持久化時機是 P4b／P5 的工作。
 */
export function set(key, value) {
  if (!(key in SCHEMA)) throw new Error(`store 沒有這個鍵：${key}`);
  if (!initialized) initStore();
  state[key] = value;
  notify(key);
  return value;
}

/**
 * 宣告某個鍵被「就地修改」了（例如 records.push(...)），藉此通知訂閱者。
 * 存取器攔不到就地修改，因此需要明確呼叫。
 */
export function touch(key) {
  if (!(key in SCHEMA)) throw new Error(`store 沒有這個鍵：${key}`);
  notify(key);
}

/** 把某個鍵的目前值寫入 localStorage。 */
export function persist(key) {
  if (!(key in SCHEMA)) throw new Error(`store 沒有這個鍵：${key}`);
  save(SCHEMA[key].storageKey, get(key));
}

/**
 * 訂閱狀態變動。
 * @param {(key: string) => void} fn
 * @returns {() => void} 取消訂閱
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 通知所有訂閱者。單一訂閱者拋錯不影響其他訂閱者。 */
function notify(key) {
  for (const fn of listeners) {
    try {
      fn(key);
    } catch (e) {
      console.error(`[store] 訂閱者處理 ${key} 時拋出例外`, e);
    }
  }
}

/** 目前狀態的快照（淺層複製），除錯與測試用。 */
export function snapshot() {
  if (!initialized) initStore();
  return { ...state };
}

/**
 * 在目標物件（預設 globalThis）上為每個狀態鍵安裝 getter/setter。
 *
 * 這是 P4a 的過渡機制：讓 src/legacy/ 的既有寫法不用改就能接上 store。
 * 詳見本檔頂部說明。
 *
 * @param {object} target
 */
export function installGlobals(target = globalThis) {
  if (!initialized) initStore();
  for (const key of STATE_KEYS) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get: () => get(key),
      set: (v) => set(key, v),
    });
  }
}

/** 測試用：移除訂閱者，避免測試之間互相影響。 */
export function __clearListeners() {
  listeners.clear();
}
