import { describe, it, expect } from 'vitest';
import {
  rateValue,
  toTwd,
  impliedRate,
  tripCurrencies,
  buildFx,
  hasFx,
  exchangeBalances,
  summarizeTripFx,
  rateLabel,
  formatRate,
  rateUsageCount,
  toTwdRecord,
  fxSourceRecord,
} from '../../src/domain/fx.js';
import { CURRENCY_LIST, currencyMeta, formatMoney } from '../../src/domain/currencies.js';

const TRIP = {
  id: 't1',
  name: '東京',
  kind: 'overseas',
  currencies: [
    {
      code: 'JPY',
      rates: [
        { id: 'fx1', type: 'fixed', rate: 0.2 },
        { id: 'ex1', type: 'exchange', twd: 10000, foreign: 50000 },
        { id: 'fl1', type: 'float', rate: 0.21 },
      ],
    },
  ],
};

const rec = (id, total, fx, extra = {}) => ({
  id,
  kind: 'expense',
  date: '2026-04-10',
  total,
  scope: { type: 'overseas', trip: 't1' },
  split: null,
  ...(fx ? { fx } : {}),
  ...extra,
});

describe('幣別目錄', () => {
  it('代碼不重複，日圓／韓元／越南盾沒有小數', () => {
    const codes = CURRENCY_LIST.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of ['JPY', 'KRW', 'VND']) expect(currencyMeta(c).decimals).toBe(0);
    expect(currencyMeta('USD').decimals).toBe(2);
  });

  it('不在目錄的代碼仍可顯示', () => {
    expect(currencyMeta('XYZ').symbol).toBe('XYZ');
  });

  it('格式化依貨幣小數位數', () => {
    expect(formatMoney('JPY', 12000)).toBe('¥12,000');
    expect(formatMoney('USD', 12.5)).toBe('US$12.5');
  });
});

describe('匯率換算', () => {
  it('固定與浮動直接用 rate；換匯用 台幣 ÷ 外幣', () => {
    expect(rateValue({ type: 'fixed', rate: 0.215 })).toBe(0.215);
    expect(rateValue({ type: 'float', rate: 31.5 })).toBe(31.5);
    expect(rateValue({ type: 'exchange', twd: 10000, foreign: 50000 })).toBe(0.2);
  });

  it('資料不全時回傳 0，不拋錯', () => {
    expect(rateValue({ type: 'exchange', twd: 100 })).toBe(0);
    expect(rateValue({ type: 'fixed' })).toBe(0);
    expect(rateValue(null)).toBe(0);
  });

  it('外幣換台幣到小數 2 位；反推匯率', () => {
    expect(toTwd(3000, 0.2151)).toBe(645.3);
    expect(impliedRate(645, 3000)).toBeCloseTo(0.215, 6);
    expect(impliedRate(0, 3000)).toBe(0);
  });

  it('匯率顯示位數隨大小調整', () => {
    expect(formatRate(0.2151)).toBe('0.2151');
    expect(formatRate(31.52)).toBe('31.520');
    expect(formatRate(1234.5)).toBe('1234.50');
  });

  it('預設標籤：自訂名稱優先，否則描述類型', () => {
    expect(rateLabel({ type: 'fixed', rate: 0.2, label: '機場' }, 'JPY')).toBe('機場');
    expect(rateLabel({ type: 'exchange', twd: 10000, foreign: 50000 }, 'JPY')).toContain('¥50,000');
  });
});

describe('tripCurrencies 清理設定', () => {
  it('剔除沒有代碼、重複、算不出匯率的項目', () => {
    const out = tripCurrencies({
      currencies: [
        {
          code: 'jpy',
          rates: [
            { id: 'a', type: 'fixed', rate: 0.2 },
            { id: 'b', type: 'fixed' },
          ],
        },
        { code: 'JPY', rates: [] },
        { rates: [] },
        null,
      ],
    });
    expect(out).toEqual([{ code: 'JPY', rates: [{ id: 'a', type: 'fixed', rate: 0.2 }] }]);
  });

  it('沒有設定時回傳空陣列', () => {
    expect(tripCurrencies({})).toEqual([]);
    expect(tripCurrencies(null)).toEqual([]);
  });
});

describe('buildFx', () => {
  it('帶匯率：存下當下的匯率快照', () => {
    const fx = buildFx({ code: 'JPY', amount: 3000, rate: TRIP.currencies[0].rates[0] });
    expect(fx).toMatchObject({
      cur: 'JPY',
      amount: 3000,
      rate: 0.2,
      rateId: 'fx1',
      rateType: 'fixed',
    });
  });

  it('刷卡：由帳單台幣反推匯率', () => {
    const fx = buildFx({ code: 'JPY', amount: 3000, rate: null, twdTotal: 660 });
    expect(fx).toMatchObject({ rateType: 'card', rateId: null });
    expect(fx.rate).toBeCloseTo(0.22, 6);
  });

  it('金額或匯率不足回傳 null', () => {
    expect(buildFx({ code: 'JPY', amount: 0, rate: null, twdTotal: 100 })).toBeNull();
    expect(buildFx({ code: 'JPY', amount: 100, rate: null, twdTotal: 0 })).toBeNull();
  });

  it('hasFx 判斷是否為有效外幣帳目', () => {
    expect(hasFx(rec('a', 1, { cur: 'JPY', amount: 10 }))).toBe(true);
    expect(hasFx(rec('a', 1, null))).toBe(false);
    expect(hasFx(rec('a', 1, { cur: 'JPY', amount: 0 }))).toBe(false);
  });
});

describe('換匯批次餘額', () => {
  it('已花、剩餘依該批的外幣金額計算', () => {
    const recs = [
      rec('a', 2000, { cur: 'JPY', amount: 10000, rate: 0.2, rateId: 'ex1', rateType: 'exchange' }),
      rec('b', 1000, { cur: 'JPY', amount: 5000, rate: 0.2, rateId: 'ex1', rateType: 'exchange' }),
      rec('c', 400, { cur: 'JPY', amount: 2000, rate: 0.2, rateId: 'fx1', rateType: 'fixed' }),
    ];
    const [b] = exchangeBalances(recs, TRIP);
    expect(b).toMatchObject({
      rateId: 'ex1',
      foreign: 50000,
      used: 15000,
      remaining: 35000,
      count: 2,
    });
  });

  it('花超過時餘額為負，照實顯示', () => {
    const recs = [
      rec('a', 12000, {
        cur: 'JPY',
        amount: 60000,
        rate: 0.2,
        rateId: 'ex1',
        rateType: 'exchange',
      }),
    ];
    expect(exchangeBalances(recs, TRIP)[0].remaining).toBe(-10000);
  });

  it('分帳不影響現金餘額（現金是整筆付出去的）', () => {
    const recs = [
      rec(
        'a',
        2000,
        { cur: 'JPY', amount: 10000, rate: 0.2, rateId: 'ex1', rateType: 'exchange' },
        {
          split: { payer: 'me', myShare: 1000, partner: 'x', preset: 'even' },
        },
      ),
    ];
    expect(exchangeBalances(recs, TRIP)[0].used).toBe(10000);
  });
});

describe('summarizeTripFx 結算', () => {
  const recs = [
    rec('a', 645, {
      cur: 'JPY',
      amount: 3000,
      rate: 0.215,
      rateId: 'fx1',
      rateType: 'fixed',
      rateLabel: '固定',
    }),
    rec('b', 1000, {
      cur: 'JPY',
      amount: 5000,
      rate: 0.2,
      rateId: 'ex1',
      rateType: 'exchange',
      rateLabel: '機場',
    }),
    rec('c', 800, {
      cur: 'JPY',
      amount: 3600,
      rate: 0.222,
      rateId: null,
      rateType: 'card',
      rateLabel: '信用卡刷卡',
    }),
    rec('d', 500, null),
    { ...rec('other', 9999, null), scope: { type: 'daily', trip: null } },
    { ...rec('inc', 700, null), kind: 'income' },
  ];

  it('台幣總計 ＝ 台幣直付 ＋ 各外幣換算，不含其他情境與收入', () => {
    const s = summarizeTripFx(recs, TRIP);
    expect(s.count).toBe(4);
    expect(s.totalTwd).toBe(645 + 1000 + 800 + 500);
    expect(s.twdOnly).toEqual({ total: 500, count: 1 });
    expect(s.currencies[0].twd).toBe(645 + 1000 + 800);
    expect(s.currencies[0].twd + s.twdOnly.total).toBe(s.totalTwd);
  });

  it('各幣別外幣加總、平均匯率、依匯率分批', () => {
    const [jpy] = summarizeTripFx(recs, TRIP).currencies;
    expect(jpy.foreign).toBe(3000 + 5000 + 3600);
    expect(jpy.count).toBe(3);
    expect(jpy.avgRate).toBeCloseTo(2445 / 11600, 6);
    expect(jpy.batches.map((b) => b.key).sort()).toEqual(['card', 'ex1', 'fx1']);
  });

  it('分帳時只計我負擔的部分，與其他畫面口徑一致', () => {
    const split = rec(
      's',
      1000,
      { cur: 'JPY', amount: 5000, rate: 0.2, rateId: 'fx1', rateType: 'fixed' },
      {
        split: { payer: 'me', myShare: 500, partner: 'x', preset: 'even' },
      },
    );
    const s = summarizeTripFx([split], TRIP);
    expect(s.totalTwd).toBe(500);
    expect(s.currencies[0].foreign).toBe(2500);
  });

  it('沒有帳目時不出錯', () => {
    const s = summarizeTripFx([], TRIP);
    expect(s).toMatchObject({ totalTwd: 0, count: 0, currencies: [] });
  });

  it('匯率被刪除後，帳目仍歸在原本的批次標籤下', () => {
    const gone = rec('g', 100, {
      cur: 'JPY',
      amount: 500,
      rate: 0.2,
      rateId: 'deleted',
      rateType: 'fixed',
      rateLabel: '舊匯率',
    });
    const [jpy] = summarizeTripFx([gone], TRIP).currencies;
    expect(jpy.batches[0].label).toBe('舊匯率');
  });

  it('rateUsageCount 計算匯率被幾筆帳目使用', () => {
    expect(rateUsageCount(recs, 't1', 'JPY', 'fx1')).toBe(1);
    expect(rateUsageCount(recs, 't1', 'JPY', 'nope')).toBe(0);
  });
});

describe('外幣整筆換成台幣', () => {
  const form = () => ({
    id: 'x',
    kind: 'expense',
    total: 330,
    grossTotal: 400,
    discountTotal: 70,
    discountOverrideTotal: null,
    items: [
      { lineId: 'a', name: '飯糰', price: 200, grossPrice: 250, unitPrice: 200, qty: 1 },
      { lineId: 'b', name: '飲料', price: 130, grossPrice: 150, unitPrice: 130, qty: 1 },
    ],
    split: { payer: 'me', partner: 'x', preset: 'own', myShare: 165, settled: false },
    scope: { type: 'overseas', trip: 't1' },
  });
  const fx = buildFx({ code: 'JPY', amount: 330, rate: null, twdTotal: 75 });

  it('頂層全部換成台幣，品項加總等於總額', () => {
    const r = toTwdRecord(form(), fx);
    expect(r.total).toBe(75);
    expect(r.items.reduce((n, i) => n + i.price, 0)).toBeCloseTo(75, 2);
    expect(r.grossTotal).toBeCloseTo(90.91, 2);
    expect(r.split.myShare).toBeCloseTo(37.5, 2);
  });

  it('外幣原貌存進 fx.orig，不被換算汙染', () => {
    const r = toTwdRecord(form(), fx);
    expect(r.fx.orig).toMatchObject({ total: 330, grossTotal: 400, myShare: 165 });
    expect(r.fx.orig.items.map((i) => i.price)).toEqual([200, 130]);
  });

  it('fxSourceRecord 還原後再換算一次結果相同（編輯不漂移）', () => {
    const once = toTwdRecord(form(), fx);
    const back = fxSourceRecord(once);
    expect(back.total).toBe(330);
    expect(back.items.map((i) => i.price)).toEqual([200, 130]);
    expect(toTwdRecord(back, { ...back.fx, amount: back.total })).toMatchObject({ total: 75 });
  });

  it('沒有 orig 的早期外幣帳目依比例反推', () => {
    const legacy = {
      id: 'o',
      kind: 'expense',
      total: 75,
      items: [{ price: 75 }],
      split: null,
      fx: { cur: 'JPY', amount: 330, rate: 0.2273, rateType: 'card' },
    };
    const back = fxSourceRecord(legacy);
    expect(back.total).toBe(330);
    expect(back.items[0].price).toBe(330);
    expect(back.fx.twd).toBe(75);
  });

  it('非外幣帳目原樣回傳，空值不出錯', () => {
    const r = { id: 'n', total: 5 };
    expect(fxSourceRecord(r)).toBe(r);
    expect(fxSourceRecord(null)).toBeNull();
  });
});
