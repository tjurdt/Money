/**
 * 特徵化測試：分帳運算。
 * 這些數值是從目前上線版本實測擷取的，代表「現況」而非「理想」。
 * 重構期間若這裡變紅，代表行為被改動了 —— 先確認是刻意的，再更新期望值。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';
import * as F from '../fixtures/records.js';

let api, close;
beforeAll(() => { ({ api, close } = bootLegacyApi()); });
afterAll(() => close());

describe('myShareOf — 我實際負擔的金額', () => {
  it('無分帳時等於總額', () => {
    expect(api.myShareOf(F.plainExpense)).toBe(55);
  });
  it('均分時為一半', () => {
    expect(api.myShareOf(F.splitEven)).toBe(600);
  });
  it('我請客時負擔全額', () => {
    expect(api.myShareOf(F.splitTreat)).toBe(400);
  });
  it('對方請客時為 0', () => {
    expect(api.myShareOf(F.splitTreated)).toBe(0);
  });
  it('收入不計入支出負擔', () => {
    expect(api.myShareOf(F.income)).toBe(0);
  });
  it('myShare 被夾在 0 與總額之間', () => {
    const over = { ...F.splitEven, split: { ...F.splitEven.split, myShare: 99999 } };
    const under = { ...F.splitEven, split: { ...F.splitEven.split, myShare: -500 } };
    expect(api.myShareOf(over)).toBe(F.splitEven.total);
    expect(api.myShareOf(under)).toBe(0);
  });
});

describe('splitBalance — 對方欠我(正) / 我欠對方(負)', () => {
  it('我先付、均分 → 對方欠我一半', () => {
    expect(api.splitBalance(F.splitEven)).toBe(600);
  });
  it('對方先付、均分 → 我欠對方一半', () => {
    expect(api.splitBalance(F.splitOtherPaid)).toBe(-350);
  });
  it('我請客 → 雙方不相欠', () => {
    expect(api.splitBalance(F.splitTreat)).toBe(0);
  });
  it('對方請客 → 回傳 -0（現況怪癖，見下註）', () => {
    // 現況：payer==='other' 時走 `-(myShareOf(r))`，myShare 為 0 就產生 -0。
    // 數值上等於 0、格式化後也看不出來，但 Object.is 與快照比對會有差異。
    // P3 抽出純函式時應正規化為 +0，屆時再更新這條期望值。
    expect(Object.is(api.splitBalance(F.splitTreated), -0)).toBe(true);
  });
  it('無分帳 → 0', () => {
    expect(api.splitBalance(F.plainExpense)).toBe(0);
  });
  it('已結清的分帳，本函式仍回傳原始餘額（結清與否由呼叫端過濾）', () => {
    expect(api.splitBalance(F.splitSettled)).toBe(600);
  });
});

describe('splitRatio — 我負擔的比例', () => {
  it('無分帳為 1', () => expect(api.splitRatio(F.plainExpense)).toBe(1));
  it('均分為 0.5', () => expect(api.splitRatio(F.splitEven)).toBe(0.5));
  it('對方請客為 0', () => expect(api.splitRatio(F.splitTreated)).toBe(0));
  it('自訂分擔 200/500 為 0.4', () => expect(api.splitRatio(F.perItemSplit)).toBe(0.4));
  it('收入為 0', () => expect(api.splitRatio(F.income)).toBe(0));
  it('總額為 0 時不會除以零', () => {
    const zero = { ...F.splitEven, total: 0, split: { ...F.splitEven.split, myShare: 0 } };
    expect(api.splitRatio(zero)).toBe(0);
  });
});
