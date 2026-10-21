/**
 * 店家自動帶入、「此店常買」與品項價格、外幣品項提示、行程結算卡的編輯入口。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootLegacyApi } from '../harness.js';

const TRIP = {
  id: 't-jp',
  name: '東京',
  kind: 'overseas',
  start: '2026-04-08',
  end: '2026-04-15',
  currencies: [{ code: 'JPY', rates: [{ id: 'fx1', type: 'fixed', rate: 0.2 }] }],
};
const REC = (id, store, date, items, extra = {}) => ({
  id,
  kind: 'expense',
  date,
  total: items.reduce((s, i) => s + i.price, 0),
  scope: { type: 'daily', trip: null },
  store,
  payment: '現金',
  items: items.map((i) => ({ qty: 1, grossPrice: i.price, ...i })),
  category: '餐食',
  sub: null,
  catMode: 'whole',
  hashtags: [],
  note: '',
  split: null,
  inv: null,
  createdAt: 1,
  ...extra,
});

let api, doc, close;
const input = (sel, value, type = 'insertText') => {
  const el = doc.querySelector(sel);
  el.value = value;
  const ev = new api.Event('input', { bubbles: true });
  ev.inputType = type;
  el.dispatchEvent(ev);
};
const boot = (records, trips = []) => {
  ({ api, close } = bootLegacyApi({
    storage: {
      'ledger.v23.seeded': '1',
      'ledger.v2.trips': trips,
      'ledger.v2.catsExpense': ['餐食', '交通', '日用品'],
      'ledger.v2.payments': ['現金', '信用卡'],
      'ledger.v2.records': records,
    },
  }));
  doc = api.document;
};
afterEach(() => close());

describe('此店常買', () => {
  beforeEach(() =>
    boot([
      REC('a', '全家 信義店', '2026-03-01', [{ name: '茶葉蛋', price: 15 }]),
      REC('b', '全家 信義店', '2026-03-02', [{ name: '茶葉蛋', price: 18 }]),
      REC('c', '全家 信義店', '2026-03-03', [{ name: '御飯糰', price: 35 }]),
      REC('d', '全家 大安店', '2026-03-04', [{ name: '御飯糰', price: 38 }]),
      REC('e', '全聯', '2026-03-05', [{ name: '牛奶', price: 60 }]),
      REC('n', '', '2026-03-06', [{ name: '雜物', price: 5 }]),
    ]),
  );
  const favs = () =>
    [...doc.querySelectorAll('#storeFav button')].map((b) => [b.dataset.n, b.dataset.p]);

  it('本店買過的排前面，價格是最近一次', () => {
    api.eval('openSheet(null);');
    input('#f-store', '全家 信義店');
    api.eval('refreshStoreItems();');
    // 茶葉蛋在信義店買了 2 次、御飯糰 1 次（大安店那次不算本店）
    expect(favs()).toEqual([
      ['茶葉蛋', '18'],
      ['御飯糰', '35'],
    ]);
  });

  it('沒填店名時不會把所有沒店名的帳目當成同一家', () => {
    api.eval('openSheet(null);');
    api.eval('refreshStoreItems();');
    expect(favs()).toEqual([]);
  });

  it('點選帶入不預設開啟 ×數量', () => {
    api.eval('openSheet(null);');
    input('#f-store', '全家 信義店');
    api.eval('refreshStoreItems();');
    doc.querySelector('#storeFav button').click();
    const row = doc.querySelector('#itemRows .itemrow');
    expect(row.classList.contains('qty')).toBe(false);
    expect(row.querySelector('.i-name').value).toBe('茶葉蛋');
    expect(row.querySelector('.i-price').value).toBe('18');
  });

  it('選品項名稱時帶入上次價格；本店沒有就參考其他店家', () => {
    api.eval('openSheet(null);');
    input('#f-store', '全聯');
    api.eval('setItemDetailOpen(true);');
    const row = doc.querySelector('#itemRows .itemrow');
    input('#itemRows .i-name', '御飯糰', 'insertReplacementText');
    expect(row.querySelector('.i-price').value).toBe('38'); // 其他店家最近一次
  });

  it('同連鎖的其他分店也算：新的分店也能帶入常買品項價格', () => {
    api.eval('openSheet(null);');
    input('#f-store', '全家 新分店');
    api.eval('refreshStoreItems();');
    expect(
      favs()
        .map((f) => f[0])
        .sort(),
    ).toEqual(['御飯糰', '茶葉蛋']);
  });
});

describe('再次消費同一店家或連鎖', () => {
  beforeEach(() =>
    boot([
      REC('a', '全家 信義店', '2026-03-01', [], { category: '日用品', payment: '信用卡' }),
      REC('b', '全家 大安店', '2026-03-05', [], { category: '餐食', payment: '現金' }),
    ]),
  );

  it('輸入另一間全家，沿用同連鎖最近一次的分類與付款方式', () => {
    api.eval('openSheet(null);');
    input('#f-store', '全家 新店');
    expect(api.eval('selCat')).toBe('餐食');
    expect(api.eval('selPay')).toBe('現金');
  });

  it('邊打字就帶入，不必離開欄位', () => {
    api.eval('openSheet(null);');
    input('#f-store', '全家 信義店');
    expect(api.eval('selCat')).toBe('餐食'); // 同連鎖最近一次（大安店）
  });
});

describe('店名一打字就出建議', () => {
  beforeEach(() =>
    boot([
      REC('a', '鼎泰豐', '2026-03-01', []),
      REC('b', '鼎泰豐', '2026-03-02', []),
      REC('c', '鼎王', '2026-03-03', []),
    ]),
  );

  it('只打 1 個字就立刻列出歷史店家（不必等網路）', () => {
    api.eval('openSheet(null);');
    input('#f-store', '鼎');
    const names = [...doc.querySelectorAll('#storeSuggest button')].map((b) => b.textContent);
    expect(names).toEqual(['🕘 鼎泰豐', '🕘 鼎王']);
  });

  it('點建議後帶入店名', () => {
    api.eval('openSheet(null);');
    input('#f-store', '鼎');
    doc.querySelector('#storeSuggest button').click();
    expect(doc.querySelector('#f-store').value).toBe('鼎泰豐');
  });

  it('Google 地標類型帶入分類；使用者選過或有歷史就不覆蓋', () => {
    api.eval('openSheet(null);');
    api.eval("applyPlaceNameToStore('新咖啡店', ['cafe', 'food'])");
    expect(api.eval('selCat')).toBe('餐食');
    api.eval(
      "selCat = null; userPicked.cat = true; applyPlaceNameToStore('加油站X', ['gas_station'])",
    );
    expect(api.eval('selCat')).toBeNull();
    api.eval("userPicked.cat = false; applyPlaceNameToStore('鼎泰豐', ['gas_station'])");
    expect(api.eval('selCat')).toBe('餐食'); // 歷史優先於地標類型
  });
});

describe('外幣品項提示', () => {
  beforeEach(() => boot([], [TRIP]));

  it('品項價格欄標示幣別，並顯示換成台幣大約多少', () => {
    api.eval("currentScope = { type: 'overseas', trip: 't-jp' }; openSheet(null);");
    api.eval('setItemDetailOpen(true);');
    doc.querySelector('#fxCurSeg button[data-cur="JPY"]').click();
    const row = doc.querySelector('#itemRows .itemrow');
    expect(row.querySelector('.i-price').placeholder).toBe('價格 JPY');
    input('#itemRows .i-price', '1000');
    expect(row.querySelector('.i-twd').textContent).toContain('200'); // 固定匯率 0.2
    expect(doc.querySelector('#itemTotalLabel').textContent).toContain('JPY');
  });
});

describe('行程結算卡的編輯入口', () => {
  beforeEach(() =>
    boot([], [TRIP, { id: 't-no', name: '大阪', kind: 'overseas', start: '', end: '' }]),
  );

  it('出國行程的結算卡有編輯按鈕，點了開啟行程編輯頁', () => {
    api.eval("currentScope = { type: 'overseas', trip: 't-jp' }; renderAll();");
    doc.querySelector('#fxEditTrip').click();
    expect(api.eval('tripEditingId')).toBe('t-jp');
    expect(doc.querySelector('#tripSheet').classList.contains('show')).toBe(true);
  });

  it('還沒設定幣別的出國行程也看得到入口', () => {
    api.eval("currentScope = { type: 'overseas', trip: 't-no' }; renderAll();");
    expect(doc.querySelector('#fxEditTrip').textContent).toContain('設定換匯');
  });
});
