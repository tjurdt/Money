/**
 * store 與 legacy 的接線測試。
 *
 * P4a 把 11 個持久化狀態搬進 src/core/store.js，並用全域存取器讓
 * src/legacy/ 既有的 `records = x` 寫法繼續運作。
 *
 * 這層接線最危險的失敗方式是「靜默失效」：legacy 若不小心又宣告了
 * `let records`，就會在自己的作用域產生一份影子副本 —— app 表面照常運作，
 * 但 store 與畫面看到的是兩份不同的資料。這裡的測試就是為了擋下這種情況。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from './harness.js';
import { STATE_KEYS } from '../src/core/store.js';
import * as F from './fixtures/records.js';

let api, errors, close;
beforeAll(() => {
  ({ api, errors, close } = bootLegacyApi({
    storage: {
      'ledger.v23.seeded': '1',
      'ledger.v2.records': [F.plainExpense],
      'ledger.v2.catsExpense': ['餐食', '交通'],
    },
  }));
});
afterAll(() => close());

describe('legacy 透過 store 存取狀態', () => {
  it('啟動時沒有錯誤', () => {
    expect(errors).toEqual([]);
  });

  it('每個狀態鍵在 app 全域上都是存取器，而非一般變數', () => {
    // 若是一般變數（legacy 自己宣告的 let），就代表接線斷了。
    const notAccessor = STATE_KEYS.filter((key) => {
      const d = Object.getOwnPropertyDescriptor(api, key);
      return !d || typeof d.get !== 'function';
    });
    expect(notAccessor, '這些鍵沒有接上 store，legacy 可能重新宣告了同名變數').toEqual([]);
  });

  it('store 載入了 localStorage 的初始資料', () => {
    expect(api.store.get('records')).toHaveLength(1);
    expect(api.store.get('records')[0].id).toBe('r-plain');
    expect(api.store.get('catsExpense')).toEqual(['餐食', '交通']);
  });

  it('legacy 讀到的與 store 是同一份資料', () => {
    expect(api.eval('records')).toBe(api.store.get('records'));
    expect(api.eval('settings')).toBe(api.store.get('settings'));
  });

  it('legacy 賦值會寫進 store', () => {
    api.eval(
      "records = [{ id: 'from-legacy', kind: 'expense', total: 1, items: [], split: null }];",
    );
    expect(api.store.get('records')[0].id).toBe('from-legacy');
  });

  it('store 賦值會被 legacy 讀到', () => {
    api.store.set('catsIncome', ['稿費']);
    expect(api.eval('catsIncome')).toEqual(['稿費']);
  });

  it('legacy 的賦值會通知 store 的訂閱者', () => {
    const seen = [];
    const off = api.store.subscribe((key) => seen.push(key));
    api.eval("payments = ['現金'];");
    off();
    expect(seen).toContain('payments');
  });
});

describe('legacy 內不得重新宣告狀態變數', () => {
  it('src/legacy/ 沒有任何狀態鍵的頂層宣告', async () => {
    const { LEGACY_FILES, LEGACY_DIR } = await import('../build/legacy-bundle.js');
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const offenders = [];
    for (const file of LEGACY_FILES) {
      const src = readFileSync(resolve(LEGACY_DIR, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        const m = line.match(/^\s*(?:let|const|var)\s+(\w+)/);
        if (m && STATE_KEYS.includes(m[1])) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders, '重新宣告會產生影子副本：app 看似正常，但 store 與畫面資料不一致').toEqual(
      [],
    );
  });
});

describe('寫入仍會持久化到 localStorage', () => {
  it('新增帳目後資料寫進 localStorage', () => {
    const fresh = bootLegacyApi({ storage: { 'ledger.v23.seeded': '1' } });
    fresh.api.eval(
      "records = [{ id: 'persist-me', kind: 'expense', date: '2026-03-05', total: 99," +
        " scope: { type: 'daily', trip: null }, store: '測試', payment: '現金', items: []," +
        " category: '餐食', sub: null, catMode: 'whole', hashtags: [], note: ''," +
        ' split: null, inv: null }];' +
        'save(K.rec, records);',
    );
    const raw = JSON.parse(fresh.api.localStorage.getItem('ledger.v2.records'));
    expect(raw[0].id).toBe('persist-me');
    fresh.close();
  });
});
