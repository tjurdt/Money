/**
 * 批次輸入品項：以 $ 分隔品項與價格。
 *
 * 原本只接受逗點。手機上 $ 比逗點好按，寫起來也更像實際的價錢標示。
 *
 * 需要留意的是 $ 有兩種用途：分隔符（牛奶$20）與幣別符號（牛奶,$20）。
 * 若一律當成分隔符，「牛奶,$20」會被拆成三欄而把價格推到分類欄位。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';

let parse, close;
beforeAll(() => {
  const booted = bootLegacyApi({ storage: { 'ledger.v23.seeded': '1' } });
  close = booted.close;
  parse = (text) => booted.api.parseBulkItems(text);
});
afterAll(() => close());

const one = (line) => {
  const { items, errors } = parse(line);
  return { item: items[0], errors };
};

describe('以 $ 分隔品項與價格', () => {
  it('牛奶$20', () => {
    expect(one('牛奶$20').item).toMatchObject({ name: '牛奶', total: 20, qty: 1 });
  });

  it('前後有空白也可以', () => {
    expect(one('牛奶 $ 20').item).toMatchObject({ name: '牛奶', total: 20 });
  });

  it('全形＄同樣有效', () => {
    expect(one('牛奶＄20').item).toMatchObject({ name: '牛奶', total: 20 });
  });

  it('可搭配單價 × 數量', () => {
    expect(one('拿鐵$65×2').item).toMatchObject({
      name: '拿鐵',
      total: 130,
      qty: 2,
      unitPrice: 65,
    });
  });

  it('後面仍可接分類與子分類', () => {
    expect(one('拿鐵$65,餐食,點心／飲料').item).toMatchObject({
      name: '拿鐵',
      total: 65,
      category: '餐食',
      sub: '點心／飲料',
    });
  });
});

describe('$ 作為幣別符號時不當成分隔', () => {
  it('牛奶,$20 —— 價格仍在第二欄，不會被推到分類', () => {
    const { item, errors } = one('牛奶,$20');
    expect(errors).toEqual([]);
    expect(item).toMatchObject({ name: '牛奶', total: 20, category: '' });
  });

  it('牛奶,$20,餐食 —— 分類不受影響', () => {
    expect(one('牛奶,$20,餐食').item).toMatchObject({
      name: '牛奶',
      total: 20,
      category: '餐食',
    });
  });

  it('牛奶$,20 —— $ 貼在逗點前面同樣視為裝飾', () => {
    expect(one('牛奶$,20').item).toMatchObject({ name: '牛奶', total: 20 });
  });
});

describe('原本的逗點格式不受影響', () => {
  it('牛奶,20', () => {
    expect(one('牛奶,20').item).toMatchObject({ name: '牛奶', total: 20 });
  });

  it('全形逗點', () => {
    expect(one('牛奶，20').item).toMatchObject({ name: '牛奶', total: 20 });
  });

  it('四欄完整格式', () => {
    expect(one('拿鐵,65×2,餐食,點心／飲料').item).toMatchObject({
      name: '拿鐵',
      total: 130,
      qty: 2,
      category: '餐食',
      sub: '點心／飲料',
    });
  });
});

describe('多行混用兩種分隔', () => {
  it('同一次輸入可以混著寫', () => {
    const { items, errors } = parse('牛奶$20\n沐浴乳,110x3,日用品\n拿鐵$65×2,餐食');
    expect(errors).toEqual([]);
    expect(items.map((x) => [x.name, x.total])).toEqual([
      ['牛奶', 20],
      ['沐浴乳', 330],
      ['拿鐵', 130],
    ]);
  });
});

describe('錯誤情況', () => {
  it('只有 $ 沒有價格會報錯', () => {
    // 與既有的「牛奶,」一致：空的價格欄視為格式無法辨識，不另外特例處理。
    expect(one('牛奶$').errors[0]).toContain('價格格式無法辨識');
    expect(one('牛奶,').errors[0]).toContain('價格格式無法辨識');
  });

  it('$ 開頭沒有品項名稱會報錯', () => {
    expect(one('$20').errors[0]).toContain('缺少品項名稱');
  });

  it('價格無法辨識時報錯', () => {
    expect(one('牛奶$abc').errors[0]).toContain('價格格式無法辨識');
  });

  it('空白行直接略過，不算錯誤', () => {
    const { items, errors } = parse('牛奶$20\n\n   \n沐浴乳$30');
    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
  });
});
