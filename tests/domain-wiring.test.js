/**
 * domain 層與 legacy 層的接線測試。
 *
 * src/domain/ 是真正的 ES Module，但 src/legacy/ 仍是單一作用域的 classic script，
 * 看不到模組匯入。過渡期由 build/legacy-bundle.js 把 domain 打包成 IIFE 並掛上
 * globalThis，讓 legacy 能照原樣呼叫。
 *
 * 這一層接線一旦斷掉，legacy 會拋 ReferenceError 而整個 app 掛掉 ——
 * 純函式的單元測試看不出來，必須實際啟動一次。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from './harness.js';
import * as domain from '../src/domain/index.js';

let api, errors, close;
beforeAll(() => {
  ({ api, errors, close } = bootLegacyApi({ storage: { 'ledger.v23.seeded': '1' } }));
});
afterAll(() => close());

describe('domain 匯出已接上 legacy 的全域作用域', () => {
  it('啟動時沒有 ReferenceError', () => {
    expect(errors).toEqual([]);
  });

  it('每個 domain 匯出都能在 app 的全域取到', () => {
    const missing = Object.keys(domain).filter((name) => api[name] === undefined);
    expect(missing, '這些匯出沒有被掛上全域，legacy 呼叫時會拋 ReferenceError').toEqual([]);
  });

  it('全域版本與模組版本的簽名一致', () => {
    // 兩者是同一份原始碼的兩次獨立求值（jsdom 內的 IIFE vs Node 的 import），
    // 因此不能用身分比對；改比對函式名稱與參數個數。
    for (const [name, fn] of Object.entries(domain)) {
      if (typeof fn !== 'function') continue;
      expect(typeof api[name], `${name} 不是函式`).toBe('function');
      expect(api[name].length, `${name} 的參數個數不一致`).toBe(fn.length);
    }
  });

  it('全域版本與模組版本算出相同結果', () => {
    const rec = {
      kind: 'expense',
      total: 1200,
      catMode: 'whole',
      category: '餐食',
      sub: '晚餐',
      items: [],
      split: { partner: '小明', payer: 'me', myShare: 600, preset: 'even', settled: false },
    };
    expect(api.myShareOf(rec)).toBe(domain.myShareOf(rec));
    expect(api.splitBalance(rec)).toBe(domain.splitBalance(rec));
    expect(api.expenseContribs(rec)).toEqual(domain.expenseContribs(rec));

    const items = [{ lineId: 'L1', price: 100, qty: 1 }];
    const rules = [{ id: 'd', type: 'order_percent', mode: 'stack', rate: 8 }];
    expect(api.calculateDiscountPlan(items, 0, rules)).toEqual(
      domain.calculateDiscountPlan(items, 0, rules),
    );
    expect(api.estimateCathayStockCosts(1000, 100, 'sell')).toEqual(
      domain.estimateCathayStockCosts(1000, 100, 'sell'),
    );
  });

  it('legacy 實際呼叫得到 domain 的計算結果', () => {
    // 走一次真實路徑：渲染清單會用到 myShareOf / splitBalance / expenseContribs。
    api.eval(
      "records = [{id:'x',kind:'expense',date:'2026-03-05',total:1200," +
        "scope:{type:'daily',trip:null},store:'火鍋店',payment:'現金',items:[]," +
        "category:'餐食',sub:null,catMode:'whole',hashtags:[],note:''," +
        "split:{partner:'小明',payer:'me',myShare:600,preset:'even',settled:false},inv:null}];" +
        "listPeriod = { mode: 'all', from: '', to: '' }; renderAll();",
    );
    const html = api.document.querySelector('#recordList').innerHTML;
    expect(html).toContain('火鍋店');
    expect(html).toContain('$600'); // myShareOf 的結果
    expect(html).toContain('小明此筆應補 $600'); // splitBalance 的結果
  });
});

describe('legacy 內不得殘留 domain 函式的重複定義', () => {
  it('src/legacy/ 沒有與 domain 匯出同名的頂層定義', async () => {
    const { LEGACY_FILES, LEGACY_DIR } = await import('../build/legacy-bundle.js');
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const names = new Set(Object.keys(domain));

    const dupes = [];
    for (const file of LEGACY_FILES) {
      const src = readFileSync(resolve(LEGACY_DIR, file), 'utf8');
      for (const m of src.matchAll(/^(?:function\s+(\w+)\s*\(|const\s+(\w+)\s*=)/gm)) {
        const n = m[1] || m[2];
        if (names.has(n)) dupes.push(`${file}: ${n}`);
      }
    }
    expect(dupes, '這些函式已移到 domain，legacy 內的舊定義會覆蓋掉模組版本').toEqual([]);
  });
});
