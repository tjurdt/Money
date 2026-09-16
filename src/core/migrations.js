/**
 * 資料遷移。
 *
 * 取代原本散落在兩個立即執行函式裡、沒有版本號、失敗時靜默跳過的遷移邏輯。
 *
 * 執行順序很重要：**遷移必須先於驗證**。
 * 舊格式的資料在遷移前本來就不符合現行形狀（例如 v1 帳目沒有 `split` 欄位），
 * 若先跑驗證去「修復」它，會把遷移所需的線索抹掉
 * —— 例如把 `split: undefined` 補成 `null`，遷移就再也認不出這是待轉換的舊資料。
 *
 * 每條遷移都必須是**冪等**的：自己判斷是否需要執行，重複呼叫不會造成損害。
 * 這樣就不需要維護「已執行到第幾號」的狀態，也不怕中途失敗後重跑。
 *
 * 新增遷移時
 *   1. 在 MIGRATIONS 陣列**末尾**加一筆（順序即執行順序）
 *   2. `applies()` 要能準確判斷「這份資料需不需要轉換」
 *   3. 補一條測試，涵蓋「需要轉換」與「已經轉換過」兩種情況
 */
import { K, load, save } from './storage.js';

/** 目前的資料格式版本，寫入 localStorage 供日後判讀。 */
export const SCHEMA_VERSION = 2;

/** 記錄資料格式版本的鍵名。 */
export const SCHEMA_VERSION_KEY = 'ledger.schemaVersion';

/**
 * @typedef {object} Migration
 * @property {string} id 供記錄與測試辨識
 * @property {string} description 這條遷移做了什麼
 * @property {() => boolean} applies 是否需要執行
 * @property {() => void} run 執行轉換
 */

/** @type {Migration[]} 依序執行。 */
export const MIGRATIONS = [
  {
    id: 'v1-records-to-v2',
    description: '把 ledger.records.v1 的舊格式帳目轉成 v2 結構，一併搬移分類與付款方式',
    applies() {
      // 已經有 v2 資料就不動 —— 避免覆蓋使用者現有的帳本。
      if (load(K.rec, null) !== null) return false;
      return Array.isArray(load('ledger.records.v1', null));
    },
    run() {
      const old = load('ledger.records.v1', null);
      save(
        K.rec,
        old.map((r) => ({
          id: r.id,
          createdAt: r.createdAt || Date.now(),
          date: r.date,
          kind: 'expense',
          scope: { type: 'daily', trip: null },
          store: r.store,
          payment: r.payment,
          hashtags: r.hashtags || [],
          note: r.note || '',
          items:
            r.item || r.total
              ? [{ name: r.item || '', price: r.total, category: null, sub: null }]
              : [],
          category: r.category || null,
          sub: null,
          catMode: 'whole',
          total: r.total,
          lending: r.status === 'advance' ? 'advance' : r.status === 'debt' ? 'debt' : null,
          counterpart: r.counterpart || '',
          settled: !!r.settled,
          inv: null,
        })),
      );
      const oldCats = load('ledger.cats.v1', null);
      if (Array.isArray(oldCats)) save(K.ce, oldCats);
      const oldPays = load('ledger.pays.v1', null);
      if (Array.isArray(oldPays)) save(K.pay, oldPays);
    },
  },

  {
    id: 'lending-to-split',
    description: '把舊的 lending／counterpart／settled 欄位轉成統一的 split 結構',
    applies() {
      const records = load(K.rec, null);
      if (!Array.isArray(records)) return false;
      return records.some((r) => r && r.kind === 'expense' && r.split === undefined);
    },
    run() {
      const records = load(K.rec, []);
      let changed = false;
      for (const r of records) {
        if (!r || typeof r !== 'object') continue;
        if (r.kind === 'expense' && r.split === undefined) {
          r.split = r.lending
            ? {
                partner: r.counterpart || '',
                // advance＝我先代墊，所以是我付款、我不負擔。
                payer: r.lending === 'advance' ? 'me' : 'other',
                myShare: r.lending === 'advance' ? 0 : r.total,
                preset: r.lending === 'advance' ? 'none' : 'all',
                settled: !!r.settled,
              }
            : null;
          changed = true;
        }
        if (r.sub === undefined) {
          r.sub = null;
          changed = true;
        }
      }
      if (changed) save(K.rec, records);
    },
  },
];

/**
 * 依序執行所有需要的遷移。
 *
 * 單一遷移失敗不會中止其餘遷移 —— 一條遷移壞掉不該讓整個 app 無法啟動。
 * 失敗會記錄在回傳值中，由呼叫端決定是否告知使用者。
 *
 * @returns {{applied: string[], failed: Array<{id: string, error: string}>}}
 */
export function runMigrations() {
  const applied = [];
  const failed = [];

  for (const m of MIGRATIONS) {
    try {
      if (!m.applies()) continue;
      m.run();
      applied.push(m.id);
    } catch (e) {
      failed.push({ id: m.id, error: e?.message || String(e) });
    }
  }

  try {
    save(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  } catch {
    // 版本記不起來不影響資料本身，遷移都是冪等的。
  }

  return { applied, failed };
}
