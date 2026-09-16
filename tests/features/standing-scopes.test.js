/**
 * 常設情境的整合測試。
 *
 * 常設情境是長期持續、但不該跟日常消費混在一起的支出
 * ——孝親費、房貸、寵物開銷之類。
 * 它與旅行的差別：沒有明確起訖，也不該進入「各趟旅遊花費」的橫向比較。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootLegacyApi } from '../harness.js';

const TRIP = { id: 't-jp', name: '日本', kind: 'overseas', start: '2026-04-08', end: '2026-04-15' };
const STANDING = { id: 's-parents', name: '孝親費', kind: 'standing', start: '', end: '' };

const REC = (id, tripId, kind, total, date = '2026-04-10') => ({
  id,
  kind: 'expense',
  date,
  total,
  scope: tripId ? { type: kind, trip: tripId } : { type: 'daily', trip: null },
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
      'ledger.v2.trips': [TRIP, STANDING],
      'ledger.v2.catsExpense': ['餐食', '交通'],
      'ledger.v2.payments': ['現金'],
      'ledger.v2.records': [
        REC('r-daily', null, null, 100),
        REC('r-trip', 't-jp', 'overseas', 8000),
        REC('r-standing', 's-parents', 'standing', 5000),
      ],
    },
  }));
  doc = api.document;
  // 測試資料集中在 2026-04，固定清單期間以免受目前月份影響。
  api.eval("listPeriod = { mode: 'all', from: '', to: '' }; renderAll();");
});
afterEach(() => close());

describe('情境選擇清單', () => {
  beforeEach(() => api.eval("openScopePicker('current');"));

  it('常設情境有自己的分區', () => {
    expect(doc.querySelector('#scopeListBody').textContent).toContain('常設情境');
  });

  it('列出已建立的常設情境', () => {
    expect(doc.querySelector('#scopeListBody').textContent).toContain('孝親費');
  });

  it('三種類型都有各自的新增按鈕', () => {
    const adds = [...doc.querySelectorAll('#scopeListBody [data-add]')].map((b) => b.dataset.add);
    expect(adds).toEqual(['domestic', 'overseas', 'standing']);
  });

  it('可以選取常設情境', () => {
    const el = [...doc.querySelectorAll('#scopeListBody .scopeitem')].find(
      (x) => x.dataset.trip === 's-parents',
    );
    el.click();
    expect(api.store.get('currentScope')).toEqual({ type: 'standing', trip: 's-parents' });
  });
});

describe('常設情境與日常分開', () => {
  it('切到日常時看不到常設情境的帳目', () => {
    api.eval("currentScope = { type: 'daily', trip: null }; renderAll();");
    const html = doc.querySelector('#recordList').innerHTML;
    expect(html).toContain('$100');
    expect(html).not.toContain('$5,000');
  });

  it('切到常設情境時只看到它自己的帳目', () => {
    api.eval("currentScope = { type: 'standing', trip: 's-parents' }; renderAll();");
    const html = doc.querySelector('#recordList').innerHTML;
    expect(html).toContain('$5,000');
    expect(html).not.toContain('$100');
  });
});

describe('不進入旅遊比較圖', () => {
  it('旅遊花費比較只列出旅程', () => {
    api.eval("chartRange = 'all'; renderTripCompare();");
    const labels = api.eval('charts.trip.config.data.labels');
    expect(labels.some((l) => l.includes('日本'))).toBe(true);
    expect(labels.some((l) => l.includes('孝親費'))).toBe(false);
  });

  it('只有常設情境、沒有旅程時整張卡片隱藏', () => {
    const only = bootLegacyApi({
      storage: {
        'ledger.v23.seeded': '1',
        'ledger.v2.trips': [STANDING],
        'ledger.v2.records': [REC('r', 's-parents', 'standing', 5000)],
      },
    });
    only.api.eval("chartRange = 'all'; renderTripCompare();");
    expect(only.api.document.querySelector('#tripCompareCard').style.display).toBe('none');
    only.close();
  });
});

describe('建立常設情境', () => {
  it('選擇常設類型時，名稱欄位與說明會跟著改', () => {
    api.eval("openTripSheet(null, 'standing');");
    expect(doc.querySelector('#tripNameLabel').textContent).toBe('情境名稱');
    expect(doc.querySelector('#t-name').placeholder).toContain('孝親費');
    expect(doc.querySelector('#tripKindNote').textContent).toContain('不會跟日常消費混在一起');
  });

  it('選擇旅程類型時是行程用語', () => {
    api.eval("openTripSheet(null, 'domestic');");
    expect(doc.querySelector('#tripNameLabel').textContent).toBe('行程名稱');
    expect(doc.querySelector('#tripKindNote').textContent).toContain('各趟旅遊花費');
  });

  it('可以在不填日期的情況下儲存', () => {
    // 常設情境是持續的，強制填日期沒有意義。
    api.eval(`
      openTripSheet(null, 'standing');
      $('#t-name').value = '房貸';
      saveTrip();
    `);
    const saved = api.store.get('trips').find((t) => t.name === '房貸');
    expect(saved).toBeTruthy();
    expect(saved.kind).toBe('standing');
  });
});

describe('設定頁', () => {
  it('列出常設情境並標示類型', () => {
    api.eval('renderSettings();');
    const html = doc.querySelector('#tripManage').textContent;
    expect(html).toContain('孝親費');
    expect(html).toContain('常設情境');
    expect(html).toContain('出國旅遊');
  });
});
