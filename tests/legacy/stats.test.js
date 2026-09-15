/**
 * 特徵化測試：統計聚合（expenseContribs）。
 * 這是圓餅圖、長條圖、分類統計共同的底層，分帳比例會乘進每一筆貢獻。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';
import * as F from '../fixtures/records.js';

let api, close;
beforeAll(() => {
  ({ api, close } = bootLegacyApi());
});
afterAll(() => close());

describe('expenseContribs — 整筆分類', () => {
  it('回傳單一貢獻，帶分類與子分類', () => {
    expect(api.expenseContribs(F.plainExpense)).toEqual([
      { category: '餐食', sub: '點心／飲料', amount: 55 },
    ]);
  });
  it('分帳後只計入我負擔的部分', () => {
    expect(api.expenseContribs(F.splitEven)).toEqual([
      { category: '餐食', sub: '晚餐', amount: 600 },
    ]);
  });
  it('沒有子分類時回傳空字串而非 null', () => {
    expect(api.expenseContribs(F.splitOtherPaid)).toEqual([
      { category: '娛樂', sub: '', amount: 350 },
    ]);
  });
});

describe('expenseContribs — 逐項分類', () => {
  it('每個品項各自貢獻到自己的分類', () => {
    expect(api.expenseContribs(F.perItemCategories)).toEqual([
      { category: '餐食', sub: '早餐', amount: 100 },
      { category: '日用品', sub: '', amount: 300 },
      { category: '日用品', sub: '', amount: 100 },
    ]);
  });

  it('逐項分類遇上分帳時，比例乘進每一項', () => {
    // 我負擔 200/500 = 0.4
    expect(api.expenseContribs(F.perItemSplit)).toEqual([
      { category: '餐食', sub: '早餐', amount: 40 },
      { category: '日用品', sub: '', amount: 120 },
      { category: '日用品', sub: '', amount: 40 },
    ]);
  });

  it('品項沒填分類時歸入「未分類」', () => {
    const r = {
      ...F.perItemCategories,
      items: [{ name: '雜項', price: 50, category: null, sub: null }],
    };
    expect(api.expenseContribs(r)).toEqual([{ category: '未分類', sub: '', amount: 50 }]);
  });
});

describe('expenseContribs — 不計入的情況', () => {
  it('收入不產生支出貢獻', () => {
    expect(api.expenseContribs(F.income)).toEqual([]);
  });
  it('對方請客（我負擔 0）不產生貢獻', () => {
    expect(api.expenseContribs(F.splitTreated)).toEqual([]);
  });
  it('沒有品項時退回用整筆金額', () => {
    const r = { ...F.plainExpense, items: [], total: 250 };
    expect(api.expenseContribs(r)).toEqual([{ category: '餐食', sub: '點心／飲料', amount: 250 }]);
  });
});
