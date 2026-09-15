/**
 * 特徵化測試：優惠／折扣引擎。
 *
 * 這是全專案最容易在重構中被改壞的部分 —— 五種規則型別、疊加 vs 擇優的組合搜尋、
 * 覆寫總額、比例分攤。以下數值皆由目前上線版本實測擷取。
 *
 * 規則 schema（由 runDiscountRules 反推）：
 *   品項以 `lineId` 辨識，`price`／`grossPrice` 為原價，`qty` 為數量。
 *   rate  —— 台式折扣「保留比例」：8 → 0.8（八折）、85 → 0.85、0.8 → 0.8。
 *   amount／minSpend／maxSaving／targetLineId／bundleQty／bundlePrice／nth／repeat。
 *   mode='best' + bestGroup 為互斥擇優組；其餘為疊加。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';

let api, grab, plan, close;
beforeAll(() => {
  ({ api, grab, close } = bootLegacyApi());
  plan = api.calculateDiscountPlan;
});
afterAll(() => close());

/** 原價合計 400：120 + 180 + 100(數量 2) */
const ITEMS = [
  { lineId: 'L1', name: '咖啡', price: 120, qty: 1 },
  { lineId: 'L2', name: '蛋糕', price: 180, qty: 1 },
  { lineId: 'L3', name: '三明治', price: 100, qty: 2 },
];

describe('normalizeDiscountRate — 折扣率正規化', () => {
  it('接受小數、一位數與百分數三種寫法', () => {
    const n = grab('normalizeDiscountRate');
    expect(n(0.8)).toBe(0.8);
    expect(n(8)).toBe(0.8);
    expect(n(80)).toBe(0.8);
    expect(n(85)).toBe(0.85);
  });
  it('1 與 10 都代表不打折', () => {
    const n = grab('normalizeDiscountRate');
    expect(n(1)).toBe(1);
    expect(n(10)).toBe(1);
  });
  it('無效輸入回傳 null，0 回傳 0', () => {
    const n = grab('normalizeDiscountRate');
    expect(n(0)).toBe(0);
    expect(n(-1)).toBeNull();
    expect(n('x')).toBeNull();
    expect(n(101)).toBeNull();
  });
});

describe('calculateDiscountPlan — 基本情況', () => {
  it('無規則時原價即實付，逐項淨額不變', () => {
    const p = plan(ITEMS, 0, []);
    expect(p.grossTotal).toBe(400);
    expect(p.discountTotal).toBe(0);
    expect(p.finalTotal).toBe(400);
    expect(p.netByLine).toEqual({ L1: 120, L2: 180, L3: 100 });
  });

  it('整單八折 → 折 80，且逐項按比例攤提', () => {
    const p = plan(ITEMS, 0, [{ id: 'd1', type: 'order_percent', mode: 'stack', rate: 8 }]);
    expect(p.finalTotal).toBe(320);
    expect(p.discountTotal).toBe(80);
    expect(p.netByLine).toEqual({ L1: 96, L2: 144, L3: 80 });
    expect(p.savings).toEqual({ d1: 80 });
  });

  it('整單折抵定額 50 → 依淨額比例分攤到各品項', () => {
    const p = plan(ITEMS, 0, [{ id: 'd2', type: 'fixed', mode: 'stack', amount: 50 }]);
    expect(p.finalTotal).toBe(350);
    expect(p.netByLine).toEqual({ L1: 105, L2: 157.5, L3: 87.5 });
  });

  it('單一品項打五折，只影響該品項', () => {
    const p = plan(ITEMS, 0, [
      { id: 'i1', type: 'item_percent', mode: 'stack', targetLineId: 'L2', rate: 5 },
    ]);
    expect(p.finalTotal).toBe(310);
    expect(p.netByLine).toEqual({ L1: 120, L2: 90, L3: 100 });
  });
});

describe('calculateDiscountPlan — 疊加與擇優', () => {
  it('疊加時依優先序套用：百分比先於定額', () => {
    const p = plan(ITEMS, 0, [
      { id: 'd1', type: 'order_percent', mode: 'stack', rate: 8, createdAt: 1 },
      { id: 'd2', type: 'fixed', mode: 'stack', amount: 50, createdAt: 2 },
    ]);
    // 400 → 八折 320 → 再扣 50 → 270
    expect(p.finalTotal).toBe(270);
    expect(p.savings).toEqual({ d1: 80, d2: 50 });
    expect(p.netByLine).toEqual({ L1: 81, L2: 121.5, L3: 67.5 });
  });

  it('同一擇優組只會選中省最多的那一條', () => {
    const p = plan(ITEMS, 0, [
      { id: 'b1', type: 'order_percent', mode: 'best', bestGroup: 'A', rate: 9 }, // 省 40
      { id: 'b2', type: 'fixed', mode: 'best', bestGroup: 'A', amount: 60 }, // 省 60 ← 勝出
    ]);
    expect(p.chosenIds).toEqual(['b2']);
    expect(p.finalTotal).toBe(340);
    expect(p.savings).toEqual({ b2: 60 });
  });

  it('回報每條擇優規則各自可省多少，供 UI 顯示比較', () => {
    const p = plan(ITEMS, 0, [
      { id: 'b1', type: 'order_percent', mode: 'best', bestGroup: 'A', rate: 9 },
      { id: 'b2', type: 'fixed', mode: 'best', bestGroup: 'A', amount: 60 },
    ]);
    expect(p.candidateExtraSavings).toEqual({ b1: 40, b2: 60 });
  });
});

describe('calculateDiscountPlan — 門檻與上限', () => {
  it('未達最低消費的規則不生效', () => {
    const p = plan(ITEMS, 0, [
      { id: 'm1', type: 'fixed', mode: 'stack', amount: 50, minSpend: 9999 },
    ]);
    expect(p.finalTotal).toBe(400);
    expect(p.savings).toEqual({});
  });

  it('折抵上限會截斷折扣金額', () => {
    // 五折本可省 200，maxSaving 30 截斷為 30
    const p = plan(ITEMS, 0, [
      { id: 'c1', type: 'order_percent', mode: 'stack', rate: 5, maxSaving: 30 },
    ]);
    expect(p.discountTotal).toBe(30);
    expect(p.finalTotal).toBe(370);
  });

  it('未知的規則型別會被忽略', () => {
    const p = plan(ITEMS, 0, [{ id: 'x', type: 'bogus', mode: 'stack', rate: 1 }]);
    expect(p.finalTotal).toBe(400);
  });
});

describe('calculateDiscountPlan — 加購組合價', () => {
  it('組合價低於原價時產生折扣', () => {
    // L3 數量 2、單價 50（淨額 100）；兩件 80 元 → 省 20
    const p = plan(ITEMS, 0, [
      {
        id: 'g1',
        type: 'bundle_price',
        mode: 'stack',
        targetLineId: 'L3',
        bundleQty: 2,
        bundlePrice: 80,
      },
    ]);
    expect(p.savings.g1).toBe(20);
    expect(p.finalTotal).toBe(380);
  });

  it('組合價高於原價時不倒扣', () => {
    const p = plan(ITEMS, 0, [
      {
        id: 'g1',
        type: 'bundle_price',
        mode: 'stack',
        targetLineId: 'L3',
        bundleQty: 2,
        bundlePrice: 150,
      },
    ]);
    expect(p.savings.g1).toBe(0);
    expect(p.finalTotal).toBe(400);
  });
});

describe('calculateDiscountPlan — 手動覆寫實付金額', () => {
  it('覆寫後以覆寫值為準，並按比例重算逐項淨額', () => {
    const p = plan(ITEMS, 0, [{ id: 'd1', type: 'order_percent', mode: 'stack', rate: 8 }], 300);
    expect(p.overrideApplied).toBe(true);
    expect(p.finalTotal).toBe(300);
    expect(p.discountTotal).toBe(100);
    expect(p.netByLine).toEqual({ L1: 90, L2: 135, L3: 75 });
  });

  it('覆寫值高於原價時不套用（防呆）', () => {
    const p = plan(ITEMS, 0, [], 9999);
    expect(p.overrideApplied).toBe(false);
    expect(p.finalTotal).toBe(400);
  });
});

describe('calculateDiscountPlan — 無品項（整筆記帳）', () => {
  it('沒有品項時以 baseAmount 當成單一「整單」列', () => {
    const p = plan([], 500, [{ id: 'd1', type: 'order_percent', mode: 'stack', rate: 9 }]);
    expect(p.grossTotal).toBe(500);
    expect(p.finalTotal).toBe(450);
    expect(p.netByLine).toEqual({ __order__: 450 });
  });

  it('金額為 0 時不會產生 NaN', () => {
    const p = plan([], 0, [{ id: 'd2', type: 'fixed', mode: 'stack', amount: 50 }]);
    expect(p.finalTotal).toBe(0);
    expect(p.discountTotal).toBe(0);
  });
});
