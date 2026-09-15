/**
 * 特徵化測試：投資損益。
 *
 * investStatsForRange() 讀取全域 records／prices，因此這裡透過 seeded localStorage
 * 啟動 app —— 連帶把「載入 → 解析 → 計算」整條路徑一起釘住。
 * 成本法：移動平均，買進含手續費入成本，賣出以當時均價認列已實現損益。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';
import { investRecords } from '../fixtures/invest.js';

let api, evalInApp, close;
beforeAll(() => {
  ({ api, evalInApp, close } = bootLegacyApi({
    storage: {
      'ledger.v2.records': investRecords,
      'ledger.v2.prices': { 2330: 140 },
      'ledger.v23.seeded': '1',
    },
  }));
  evalInApp("chartRange = 'all';"); // 讓 inRange() 涵蓋所有日期
});
afterAll(() => close());

describe('estimateCathayStockCosts — 手續費與交易稅', () => {
  it('買進只收手續費，無交易稅', () => {
    expect(api.estimateCathayStockCosts(1000, 100, 'buy')).toEqual({
      value: 100000, commission: 40, tax: 0, total: 40, taxRate: 0,
    });
  });
  it('賣出加收千分之三證交稅', () => {
    expect(api.estimateCathayStockCosts(1000, 100, 'sell')).toEqual({
      value: 100000, commission: 40, tax: 300, total: 340, taxRate: 0.003,
    });
  });
  it('當沖證交稅減半', () => {
    expect(api.estimateCathayStockCosts(1000, 100, 'sell', true)).toEqual({
      value: 100000, commission: 40, tax: 150, total: 190, taxRate: 0.0015,
    });
  });
  it('股數或價格為 0 時全部歸零', () => {
    expect(api.estimateCathayStockCosts(0, 100, 'buy')).toEqual({
      value: 0, commission: 0, tax: 0, total: 0, taxRate: 0,
    });
  });
});

describe('investStatsForRange — 移動平均成本法', () => {
  it('已實現損益依賣出當時的平均成本計算', () => {
    // 買 1000@100 含費 → 成本 100040；再買 1000@120 含費 → 累計 220090 / 2000 股
    // 均價 110.045；賣 500@130 扣費 60 → 收 64940，成本 55022.5 → 獲利 9917.5
    const s = api.investStatsForRange();
    expect(s.realized).toBeCloseTo(9917.5, 2);
  });

  it('股利獨立累計，不混入已實現損益', () => {
    expect(api.investStatsForRange().dividends).toBe(3000);
  });

  it('有現價時計算未實現損益', () => {
    // 剩 1500 股、成本 165067.5（均價 110.045）；現價 140 → 未實現 44932.5
    const s = api.investStatsForRange();
    expect(s.unrealized).toBeCloseTo(44932.5, 2);
  });
});

describe('investStatsForRange — 邊界情況', () => {
  it('沒有任何行情時未實現損益為 null，而非 0', () => {
    const { api: a2, evalInApp: e2, close: c2 } = bootLegacyApi({
      storage: { 'ledger.v2.records': investRecords, 'ledger.v2.prices': {}, 'ledger.v23.seeded': '1' },
    });
    e2("chartRange = 'all';");
    expect(a2.investStatsForRange().unrealized).toBeNull();
    c2();
  });

  it('完全沒有投資紀錄時回傳零值', () => {
    const { api: a3, evalInApp: e3, close: c3 } = bootLegacyApi({
      storage: { 'ledger.v2.records': [], 'ledger.v23.seeded': '1' },
    });
    e3("chartRange = 'all';");
    expect(a3.investStatsForRange()).toEqual({ realized: 0, dividends: 0, unrealized: null });
    c3();
  });
});
