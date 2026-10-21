import { describe, it, expect } from 'vitest';
import { lastStoreDefaults, matchStores } from '../../src/domain/store-defaults.js';

const R = (id, store, date, category, payment, extra = {}) => ({
  id,
  kind: 'expense',
  store,
  date,
  createdAt: 1,
  category,
  sub: null,
  payment,
  catMode: 'whole',
  items: [],
  total: 100,
  ...extra,
});

describe('lastStoreDefaults', () => {
  it('取最近一筆，而不是出現最多次的', () => {
    const recs = [
      R('1', '全家', '2026-01-01', '餐食', '現金'),
      R('2', '全家', '2026-01-02', '餐食', '現金'),
      R('3', '全家', '2026-02-01', '日用品', '信用卡'),
    ];
    expect(lastStoreDefaults(recs, '全家')).toMatchObject({
      category: '日用品',
      payment: '信用卡',
    });
  });

  it('同一天以建立時間較晚者為準', () => {
    const recs = [
      R('1', '全家', '2026-01-01', '餐食', '現金', { createdAt: 1 }),
      R('2', '全家', '2026-01-01', '日用品', '信用卡', { createdAt: 2 }),
    ];
    expect(lastStoreDefaults(recs, '全家').category).toBe('日用品');
  });

  it('子分類跟著分類一起帶入', () => {
    const recs = [R('1', '麥當勞', '2026-01-01', '餐食', '現金', { sub: '午餐' })];
    expect(lastStoreDefaults(recs, '麥當勞')).toEqual({
      category: '餐食',
      sub: '午餐',
      payment: '現金',
    });
  });

  it('比對店名時忽略大小寫與前後空白', () => {
    const recs = [R('1', '7-Eleven', '2026-01-01', '餐食', '現金')];
    expect(lastStoreDefaults(recs, '  7-eleven ')).not.toBeNull();
  });

  it('沒有歷史、空店名回傳 null', () => {
    expect(lastStoreDefaults([R('1', 'A', '2026-01-01', '餐食', '現金')], 'B')).toBeNull();
    expect(lastStoreDefaults([], '')).toBeNull();
  });

  it('逐項分類的帳目取第一個有分類的品項', () => {
    const recs = [
      R('1', '全聯', '2026-01-01', null, '現金', {
        catMode: 'perItem',
        items: [{ name: 'x' }, { name: 'y', category: '日用品', sub: '清潔' }],
      }),
    ];
    expect(lastStoreDefaults(recs, '全聯')).toMatchObject({ category: '日用品', sub: '清潔' });
  });

  it('最近一筆缺付款方式時，退回較早且有付款方式的那筆', () => {
    const recs = [
      R('1', 'A', '2026-01-01', '餐食', '現金'),
      R('2', 'A', '2026-02-01', '餐食', null),
    ];
    expect(lastStoreDefaults(recs, 'A').payment).toBe('現金');
  });

  it('排除正在編輯的帳目、不看收入與其他店', () => {
    const recs = [
      R('1', 'A', '2026-01-01', '餐食', '現金'),
      R('2', 'A', '2026-03-01', '娛樂', '信用卡'),
      R('3', 'A', '2026-04-01', '薪資', '轉帳', { kind: 'income' }),
    ];
    expect(lastStoreDefaults(recs, 'A', { excludeId: '2' }).category).toBe('餐食');
    expect(lastStoreDefaults(recs, 'A').category).toBe('娛樂');
  });
});

describe('lastStoreDefaults：連鎖店', () => {
  const chainOf = (r) => (String(r.store).startsWith('全家') ? '全家' : '');
  it('沒去過這間分店，沿用同連鎖其他分店最近一次', () => {
    const recs = [
      R('1', '全家 信義店', '2026-01-01', '日用品', '信用卡'),
      R('2', '全家 大安店', '2026-02-01', '餐食', '現金'),
    ];
    expect(lastStoreDefaults(recs, '全家 新店', { chain: '全家', chainOf })).toMatchObject({
      category: '餐食',
      payment: '現金',
    });
  });
  it('沒給連鎖資訊時維持原本只比對店名', () => {
    expect(
      lastStoreDefaults([R('1', '全家 信義店', '2026-01-01', '餐食', '現金')], '全家 新店'),
    ).toBeNull();
  });
  it('只有連鎖、沒有店名也能查', () => {
    const recs = [R('1', '全家 信義店', '2026-01-01', '餐食', '現金')];
    expect(lastStoreDefaults(recs, '', { chain: '全家', chainOf })).not.toBeNull();
  });
});

describe('matchStores', () => {
  const recs = [
    R('1', '鼎泰豐', '2026-01-01', '餐食', '現金'),
    R('2', '鼎泰豐', '2026-01-02', '餐食', '現金'),
    R('3', '鼎王', '2026-01-03', '餐食', '現金'),
    R('4', '小鼎', '2026-01-04', '餐食', '現金'),
    R('5', '全聯', '2026-01-05', '日用品', '現金'),
  ];
  it('開頭相符優先，其次次數多的', () => {
    expect(matchStores(recs, '鼎')).toEqual(['鼎泰豐', '鼎王', '小鼎']);
  });
  it('不分大小寫，空字串回傳空陣列', () => {
    expect(matchStores([R('1', '7-ELEVEN', '2026-01-01', '餐食', '現金')], '7-el')).toEqual([
      '7-ELEVEN',
    ]);
    expect(matchStores(recs, '')).toEqual([]);
  });
});
