/**
 * 圖表跟隨右上角情境。
 *
 * 原本圖表頁有一組獨立的情境篩選器，與右上角的情境毫無關聯 ——
 * 切到某趟旅行後，圖表仍統計全部資料、時間軸仍停在「本月」。
 *
 * 現在圖表預設跟著右上角走，且情境若設有時間區間，
 * 圖表的時間範圍會自動對齊到那段期間。
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

/** 切換右上角情境（走 store，與實際操作一致）。 */
const setScope = (sc) => api.store.set('currentScope', sc);

describe('篩選範圍跟隨情境', () => {
  it('切到某趟旅行時，圖表只統計該行程', () => {
    setScope({ type: 'overseas', trip: 't-jp' });
    expect([...api.eval('selectedScopes')]).toEqual(['t-jp']);
  });

  it('切到日常時只統計日常', () => {
    setScope({ type: 'daily', trip: null });
    expect([...api.eval('selectedScopes')]).toEqual(['daily']);
  });

  it('切到「全部」時不設限', () => {
    setScope({ type: 'all', trip: null });
    expect(api.eval('selectedScopes.size')).toBe(0);
  });

  it('切到常設情境時只統計該情境', () => {
    setScope({ type: 'standing', trip: 's-parents' });
    expect([...api.eval('selectedScopes')]).toEqual(['s-parents']);
  });
});

describe('時間範圍對齊到情境區間', () => {
  it('旅行有起訖時，圖表時間自動對齊', () => {
    setScope({ type: 'overseas', trip: 't-jp' });
    expect(api.eval('chartRange')).toBe('custom');
    expect(api.eval('customFrom')).toBe('2026-04-08');
    expect(api.eval('customTo')).toBe('2026-04-15');
  });

  it('自訂日期輸入框也跟著更新', () => {
    setScope({ type: 'overseas', trip: 't-jp' });
    expect(doc.querySelector('#chartFrom').value).toBe('2026-04-08');
    expect(doc.querySelector('#chartTo').value).toBe('2026-04-15');
  });

  it('切到另一趟旅行會重新對齊', () => {
    setScope({ type: 'overseas', trip: 't-jp' });
    setScope({ type: 'domestic', trip: 't-hl' });
    expect(api.eval('customFrom')).toBe('2026-06-01');
    expect(api.eval('customTo')).toBe('2026-06-03');
  });

  it('常設情境沒有區間時不動時間範圍', () => {
    // 孝親費是持續性的，硬套一段日期反而會篩掉大部分資料。
    api.eval("chartRange = 'year'; chartRangeFromScope = false;");
    setScope({ type: 'standing', trip: 's-parents' });
    expect(api.eval('chartRange')).toBe('year');
  });

  it('從有區間的旅行切回日常時，還原成預設範圍', () => {
    setScope({ type: 'overseas', trip: 't-jp' });
    expect(api.eval('chartRange')).toBe('custom');
    setScope({ type: 'daily', trip: null });
    expect(api.eval('chartRange')).toBe('month');
    expect(api.eval('customFrom')).toBe('');
  });

  it('使用者手選的時間範圍不會被情境覆寫', () => {
    // 只有「由情境自動帶入」的範圍才會被還原，手選的要尊重。
    api.eval("$('#rangeSeg').querySelectorAll('button')[2].click();"); // 今年
    expect(api.eval('chartRange')).toBe('year');
    setScope({ type: 'daily', trip: null });
    expect(api.eval('chartRange')).toBe('year');
  });
});

describe('統計結果確實改變', () => {
  it('切到日本後，支出統計只算該行程', () => {
    setScope({ type: 'overseas', trip: 't-jp' });
    api.eval('renderCharts();');
    expect(doc.querySelector('#statSpend').textContent).toBe('$8,000');
  });

  it('切到花蓮後換成花蓮的金額', () => {
    setScope({ type: 'domestic', trip: 't-hl' });
    api.eval('renderCharts();');
    expect(doc.querySelector('#statSpend').textContent).toBe('$3,000');
  });
});

describe('仍可手動覆寫', () => {
  beforeEach(() => {
    setScope({ type: 'overseas', trip: 't-jp' });
    api.eval('renderCharts();');
  });

  it('預設顯示「跟隨上方」', () => {
    expect(doc.querySelector('#chartScopeSummary').textContent).toContain('跟隨上方');
  });

  it('手動勾選後標示「已手動調整」', () => {
    const chip = [...doc.querySelectorAll('#chartScopeChips .chip')].find(
      (b) => b.dataset.s === 't-hl',
    );
    chip.click();
    expect(doc.querySelector('#chartScopeSummary').textContent).toContain('已手動調整');
  });

  it('手動加選後可同時比較兩趟旅行', () => {
    const chip = [...doc.querySelectorAll('#chartScopeChips .chip')].find(
      (b) => b.dataset.s === 't-hl',
    );
    chip.click();
    expect([...api.eval('selectedScopes')].sort()).toEqual(['t-hl', 't-jp']);
  });

  it('再次切換右上角情境會重新同步，並解除手動標記', () => {
    const chip = [...doc.querySelectorAll('#chartScopeChips .chip')].find(
      (b) => b.dataset.s === 't-hl',
    );
    chip.click();
    setScope({ type: 'daily', trip: null });
    api.eval('renderCharts();');
    expect([...api.eval('selectedScopes')]).toEqual(['daily']);
    expect(doc.querySelector('#chartScopeSummary').textContent).toContain('跟隨上方');
  });
});
