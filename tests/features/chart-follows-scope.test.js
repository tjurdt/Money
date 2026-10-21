/**
 * 圖表沒有自己的時間與情境篩選，完全跟隨上方的日期與右上角情境；
 * 另有四顆快捷鈕（日常／歷次國內／歷次出國／所有常設）可一次橫跨多種情境，
 * 點擊後時間預設為全部、右上角顯示「自訂」，離開圖表頁時還原。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootLegacyApi } from '../harness.js';

const TRIP = { id: 't-jp', name: '日本', kind: 'overseas', start: '2026-04-08', end: '2026-04-15' };
const TRIP2 = {
  id: 't-hl',
  name: '花蓮',
  kind: 'domestic',
  start: '2026-06-01',
  end: '2026-06-03',
};
const STANDING = { id: 's-parents', name: '孝親費', kind: 'standing', start: '', end: '' };

const REC = (id, tripId, type, total, date) => ({
  id,
  kind: 'expense',
  date,
  total,
  scope: tripId ? { type, trip: tripId } : { type: 'daily', trip: null },
  store: '測試',
  payment: '現金',
  items: [],
  category: '餐食',
  sub: null,
  catMode: 'whole',
  hashtags: [],
  note: '',
  split: null,
  inv: null,
});

let api, doc, close;
beforeEach(() => {
  ({ api, close } = bootLegacyApi({
    storage: {
      'ledger.v23.seeded': '1',
      'ledger.v2.trips': [TRIP, TRIP2, STANDING],
      'ledger.v2.catsExpense': ['餐食'],
      'ledger.v2.payments': ['現金'],
      'ledger.v2.records': [
        REC('r-daily', null, null, 100, '2026-04-10'),
        REC('r-jp', 't-jp', 'overseas', 8000, '2026-04-10'),
        REC('r-hl', 't-hl', 'domestic', 3000, '2026-06-02'),
        REC('r-parents', 's-parents', 'standing', 5000, '2026-01-05'),
      ],
    },
  }));
  doc = api.document;
});
afterEach(() => close());

const setScope = (sc) => api.store.set('currentScope', sc);
const ALL = { mode: 'all', from: '', to: '' };
const stat = () => {
  api.eval('renderCharts();');
  return doc.querySelector('#statSpend').textContent;
};
const quick = (kind) =>
  [...doc.querySelectorAll('#chartScopeChips .chip')].find((b) => b.dataset.s === kind).click();
const goto = (view) => doc.querySelector(`.nav button[data-view="${view}"]`).click();

describe('跟隨上方情境與日期', () => {
  beforeEach(() => api.eval(`listPeriod = ${JSON.stringify(ALL)};`));

  it('切到某趟旅行時，只統計該行程', () => {
    setScope({ type: 'overseas', trip: 't-jp' });
    expect(stat()).toBe('$8,000');
  });

  it('切到日常時只統計日常', () => {
    setScope({ type: 'daily', trip: null });
    expect(stat()).toBe('$100');
  });

  it('切到「全部」時不設限', () => {
    setScope({ type: 'all', trip: null });
    expect(stat()).toBe('$16,100');
  });

  it('切到常設情境時只統計該情境', () => {
    setScope({ type: 'standing', trip: 's-parents' });
    expect(stat()).toBe('$5,000');
  });

  it('時間範圍跟上方日期走', () => {
    setScope({ type: 'all', trip: null });
    api.eval("setListPeriod('month', '2026-04-01');");
    expect(stat()).toBe('$8,100');
  });

  it('圖表頁沒有自己的時間列與分帳結算', () => {
    expect(doc.querySelector('#rangeSeg')).toBeNull();
    expect(doc.querySelector('#balanceList')).toBeNull();
  });
});

describe('快捷情境按鈕', () => {
  beforeEach(() => {
    api.eval("setListPeriod('month', '2026-04-01');");
    setScope({ type: 'daily', trip: null });
    api.eval('renderCharts();');
  });

  it('只有四顆按鈕', () => {
    expect([...doc.querySelectorAll('#chartScopeChips .chip')].map((b) => b.dataset.s)).toEqual([
      'daily',
      'domestic',
      'overseas',
      'standing',
    ]);
  });

  it('點擊後時間變成全部、右上角顯示自訂', () => {
    quick('overseas');
    expect(api.eval('listPeriod.mode')).toBe('all');
    expect(doc.querySelector('#scopePillText').textContent).toBe('自訂');
    expect(stat()).toBe('$8,000');
  });

  it('可複選：歷次旅行不含常設情境', () => {
    quick('domestic');
    quick('overseas');
    expect(stat()).toBe('$11,000');
    quick('standing');
    expect(stat()).toBe('$16,000');
  });

  it('時間範圍可再調整', () => {
    quick('overseas');
    quick('domestic');
    api.eval("setListPeriod('month', '2026-06-01');");
    expect(stat()).toBe('$3,000');
    expect(api.eval('chartOverride !== null')).toBe(true);
  });

  it('切到清單時還原原本的情境與時間', () => {
    quick('overseas');
    goto('list');
    expect(api.eval('chartOverride')).toBe(null);
    expect(api.eval('currentScope.type')).toBe('daily');
    expect(api.eval('listPeriod.mode')).toBe('month');
    expect(api.eval('listPeriod.from')).toBe('2026-04-01');
    expect(doc.querySelector('#scopePillText').textContent).toContain('日常');
  });

  it('取消所有按鈕也會還原', () => {
    quick('overseas');
    quick('overseas');
    expect(api.eval('listPeriod.mode')).toBe('month');
  });

  it('快捷模式的暫時「全部」不會被存進儲存空間', () => {
    quick('overseas');
    expect(api.eval("JSON.parse(localStorage.getItem('ledger.list.period.v1')).mode")).toBe(
      'month',
    );
  });

  it('自己改右上角情境會結束快捷模式', () => {
    quick('overseas');
    api.eval("scopePickerTarget = 'current'; selectScope({ type: 'all', trip: null });");
    expect(api.eval('chartOverride')).toBe(null);
  });
});

describe('各趟旅遊花費只列出時間範圍涵蓋的旅程', () => {
  const labels = () => {
    api.eval('renderTripCompare();');
    return api.eval('charts.trip.config.data.labels');
  };
  beforeEach(() => setScope({ type: 'all', trip: null }));

  it('四月只有日本', () => {
    api.eval("setListPeriod('month', '2026-04-01');");
    expect(labels().join()).toContain('日本');
    expect(labels().join()).not.toContain('花蓮');
  });

  it('全部時間兩趟都有', () => {
    api.eval(`listPeriod = ${JSON.stringify(ALL)};`);
    expect(labels()).toHaveLength(2);
  });

  it('範圍內沒有旅程時整張卡片隱藏', () => {
    api.eval("setListPeriod('month', '2026-01-01');");
    api.eval('renderTripCompare();');
    expect(doc.querySelector('#tripCompareCard').style.display).toBe('none');
  });
});
