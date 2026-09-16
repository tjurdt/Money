/**
 * 資料形狀驗證與修復的單元測試。
 *
 * 核心原則：能修就修、不能用才隔離、絕不靜默丟棄使用者資料。
 * 這些是使用者累積多年的帳本，過度嚴格造成的損失比放行一筆奇怪資料更嚴重。
 */
import { describe, it, expect } from 'vitest';
import {
  isUsableRecord,
  repairRecord,
  salvageRecords,
  validateStateValue,
  RECORD_KINDS,
} from '../../src/core/schema.js';

const minimal = { id: 'r1', total: 100 };

describe('isUsableRecord', () => {
  it('接受只有識別碼與金額的最小帳目', () => {
    expect(isUsableRecord(minimal)).toBe(true);
  });

  it('拒絕非物件', () => {
    for (const v of [null, undefined, 'x', 42, [], true]) {
      expect(isUsableRecord(v)).toBe(false);
    }
  });

  it('拒絕沒有識別碼的帳目', () => {
    expect(isUsableRecord({ total: 100 })).toBe(false);
    expect(isUsableRecord({ id: null, total: 100 })).toBe(false);
  });

  it('拒絕金額不是有限數字的帳目', () => {
    expect(isUsableRecord({ id: 'r', total: 'abc' })).toBe(false);
    expect(isUsableRecord({ id: 'r', total: NaN })).toBe(false);
    expect(isUsableRecord({ id: 'r', total: Infinity })).toBe(false);
  });

  it('接受數字型別的識別碼（舊資料可能是數字）', () => {
    expect(isUsableRecord({ id: 12345, total: 100 })).toBe(true);
  });
});

describe('repairRecord', () => {
  it('補齊缺少的結構欄位，不臆測數值', () => {
    const r = repairRecord(minimal);
    expect(r.items).toEqual([]);
    expect(r.hashtags).toEqual([]);
    expect(r.note).toBe('');
    expect(r.split).toBeNull();
    expect(r.inv).toBeNull();
    expect(r.scope).toEqual({ type: 'daily', trip: null });
  });

  it('不修改輸入物件', () => {
    const input = { ...minimal };
    repairRecord(input);
    expect(input.items).toBeUndefined();
  });

  it('保留既有的合法欄位', () => {
    const r = repairRecord({
      ...minimal,
      kind: 'income',
      note: '薪水',
      items: [{ name: '項目', price: 10 }],
    });
    expect(r.kind).toBe('income');
    expect(r.note).toBe('薪水');
    expect(r.items).toHaveLength(1);
  });

  it('未知的 kind 退回 expense', () => {
    expect(repairRecord({ ...minimal, kind: '亂寫' }).kind).toBe('expense');
  });

  it('所有合法 kind 都被保留', () => {
    for (const kind of RECORD_KINDS) {
      expect(repairRecord({ ...minimal, kind }).kind).toBe(kind);
    }
  });

  it('剔除 items 裡的非物件項目', () => {
    const r = repairRecord({ ...minimal, items: [{ name: 'ok' }, null, 'x', 5] });
    expect(r.items).toEqual([{ name: 'ok' }]);
  });

  it('識別碼一律轉成字串', () => {
    expect(repairRecord({ id: 123, total: 1 }).id).toBe('123');
  });
});

describe('salvageRecords', () => {
  it('非陣列視為整體無法使用', () => {
    const out = salvageRecords({ oops: true });
    expect(out.fatal).toBe(true);
    expect(out.records).toEqual([]);
  });

  it('保留可用的帳目，剔除壞掉的', () => {
    const out = salvageRecords([minimal, null, 'x', { 沒有識別碼: 1 }, { id: 'r2', total: 5 }]);
    expect(out.fatal).toBe(false);
    expect(out.records.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(out.dropped).toHaveLength(3);
  });

  it('空陣列是合法的，不算壞掉', () => {
    expect(salvageRecords([])).toEqual({ records: [], dropped: [], fatal: false });
  });
});

describe('validateStateValue', () => {
  it('形狀不符時回傳預設值並標記 fatal', () => {
    const out = validateStateValue('records', { oops: true }, []);
    expect(out.fatal).toBe(true);
    expect(out.value).toEqual([]);
  });

  it('形狀正確時保留資料', () => {
    const out = validateStateValue('catsExpense', ['餐食'], []);
    expect(out.fatal).toBe(false);
    expect(out.value).toEqual(['餐食']);
  });

  it('陣列中混入的非字串會被剔除並記錄', () => {
    const out = validateStateValue('catsExpense', ['餐食', null, 42], []);
    expect(out.value).toEqual(['餐食']);
    expect(out.dropped).toEqual([null, 42]);
  });

  it('twseCache 允許為 null', () => {
    expect(validateStateValue('twseCache', null, null).fatal).toBe(false);
  });

  it('物件型狀態收到陣列時視為無法使用', () => {
    expect(validateStateValue('settings', [], {}).fatal).toBe(true);
  });

  it('未知的鍵原樣通過，不擋下未納管的資料', () => {
    const out = validateStateValue('未納管', '任意值', null);
    expect(out.value).toBe('任意值');
    expect(out.fatal).toBe(false);
  });
});
