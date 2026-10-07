/**
 * 外幣記帳、行程結算，以及「輸入店名自動帶入上一筆」。
 * 從畫面操作出發，確認整條接線（表單 → 儲存 → 結算卡）都通。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootLegacyApi } from '../harness.js';

const TRIP = {
  id: 't-jp',
  name: '東京',
  kind: 'overseas',
  start: '2026-04-08',
  end: '2026-04-15',
  currencies: [
    {
      code: 'JPY',
      rates: [
        { id: 'fx1', type: 'fixed', rate: 0.2 },
        { id: 'ex1', type: 'exchange', label: '機場', twd: 10000, foreign: 50000 },
        { id: 'fl1', type: 'float', rate: 0.21 },
      ],
    },
  ],
};
const BASE = (id, store, date, category, payment) => ({
  id,
  kind: 'expense',
  date,
  total: 100,
  scope: { type: 'daily', trip: null },
  store,
  payment,
  items: [],
  category,
  sub: null,
  catMode: 'whole',
  hashtags: [],
  note: '',
  split: null,
  inv: null,
  createdAt: 1,
});

let api, doc, close;
const input = (sel, value) => {
  const el = doc.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new api.Event('input', { bubbles: true }));
};
const stored = (key) => JSON.parse(api.localStorage.getItem(key));
beforeEach(() => {
  ({ api, close } = bootLegacyApi({
    storage: {
      'ledger.v23.seeded': '1',
      'ledger.v2.trips': [TRIP],
      'ledger.v2.catsExpense': ['餐食', '交通', '日用品'],
      'ledger.v2.payments': ['現金', '信用卡'],
      'ledger.v2.records': [
        BASE('old', '全家', '2026-03-01', '日用品', '信用卡'),
        BASE('new', '全家', '2026-03-05', '餐食', '現金'),
      ],
    },
  }));
  doc = api.document;
});
afterEach(() => close());

describe('輸入店名自動帶入上一筆', () => {
  beforeEach(() => api.eval('openSheet(null);'));

  it('帶入該店上一筆的分類與付款方式', () => {
    input('#f-store', '全家');
    doc.querySelector('#f-store').dispatchEvent(new api.Event('blur'));
    expect(api.eval('selCat')).toBe('餐食');
    expect(api.eval('selPay')).toBe('現金');
  });

  it('使用者已經親自選過的欄位不被覆蓋', () => {
    api.eval("userPicked.cat = true; selCat = '交通';");
    input('#f-store', '全家');
    doc.querySelector('#f-store').dispatchEvent(new api.Event('blur'));
    expect(api.eval('selCat')).toBe('交通');
    expect(api.eval('selPay')).toBe('現金');
  });

  it('預設的「上次付款方式」不會擋住店家的習慣', () => {
    api.eval("settings.lastPayment = '信用卡'; openSheet(null);");
    expect(api.eval('selPay')).toBe('信用卡');
    input('#f-store', '全家');
    doc.querySelector('#f-store').dispatchEvent(new api.Event('change'));
    expect(api.eval('selPay')).toBe('現金');
  });

  it('沒有歷史的新店不動任何欄位', () => {
    input('#f-store', '從沒去過的店');
    doc.querySelector('#f-store').dispatchEvent(new api.Event('blur'));
    expect(api.eval('selCat')).toBeNull();
  });

  it('編輯舊帳目時不介入', () => {
    api.eval("openSheet('old');");
    input('#f-store', '全家');
    doc.querySelector('#f-store').dispatchEvent(new api.Event('blur'));
    expect(api.eval('selCat')).toBe('日用品');
  });
});

describe('外幣記帳', () => {
  const open = () =>
    api.eval("currentScope = { type: 'overseas', trip: 't-jp' }; openSheet(null);");
  const pickCurrency = (code) =>
    [...doc.querySelectorAll('#fxCurSeg button')].find((b) => b.dataset.cur === code).click();

  it('在沒有外幣設定的情境裡不顯示外幣區塊', () => {
    api.eval('openSheet(null);');
    expect(doc.querySelector('#fxEntry').style.display).toBe('none');
  });

  it('出國情境顯示幣別選項，預設台幣', () => {
    open();
    expect(doc.querySelector('#fxEntry').style.display).toBe('block');
    const labels = [...doc.querySelectorAll('#fxCurSeg button')].map((b) => b.textContent);
    expect(labels[0]).toContain('台幣');
    expect(labels[1]).toContain('JPY');
    expect(doc.querySelector('#fxFields').style.display).toBe('none');
  });

  it('輸入外幣金額自動換算台幣，儲存時 total 為台幣、fx 為匯率快照', () => {
    open();
    pickCurrency('JPY');
    input('#f-total', '3000');
    expect(doc.querySelector('#f-fxtwd').value).toBe('600');
    doc.querySelector('#saveBtn').click();
    const r = stored('ledger.v2.records').find((x) => x.scope.trip === 't-jp');
    expect(r.total).toBe(600);
    expect(r.fx).toMatchObject({ cur: 'JPY', amount: 3000, rate: 0.2, rateId: 'fx1' });
  });

  it('換成換匯批次後金額依該批匯率重算', () => {
    open();
    pickCurrency('JPY');
    input('#f-total', '5000');
    const sel = doc.querySelector('#f-fxrate');
    sel.value = 'ex1';
    sel.dispatchEvent(new api.Event('change', { bubbles: true }));
    expect(doc.querySelector('#f-fxtwd').value).toBe('1000');
  });

  it('刷卡：台幣金額自己輸入，匯率由帳單反推', () => {
    open();
    pickCurrency('JPY');
    input('#f-total', '3000');
    const sel = doc.querySelector('#f-fxrate');
    sel.value = 'card';
    sel.dispatchEvent(new api.Event('change', { bubbles: true }));
    input('#f-fxtwd', '690');
    doc.querySelector('#saveBtn').click();
    const r = stored('ledger.v2.records').find((x) => x.scope.trip === 't-jp');
    expect(r.total).toBe(690);
    expect(r.fx.rateType).toBe('card');
    expect(r.fx.rate).toBeCloseTo(0.23, 6);
  });

  it('台幣付款不寫 fx', () => {
    open();
    input('#f-total', '250');
    doc.querySelector('#saveBtn').click();
    const r = stored('ledger.v2.records').find((x) => x.scope.trip === 't-jp');
    expect(r.total).toBe(250);
    expect(r.fx).toBeUndefined();
  });

  it('刷卡卻沒填帳單台幣不能儲存', () => {
    open();
    pickCurrency('JPY');
    const sel = doc.querySelector('#f-fxrate');
    sel.value = 'card';
    sel.dispatchEvent(new api.Event('change', { bubbles: true }));
    input('#f-total', '3000');
    doc.querySelector('#saveBtn').click();
    expect(stored('ledger.v2.records').some((x) => x.scope.trip === 't-jp')).toBe(false);
  });

  describe('品項以外幣輸入（超商刷卡）', () => {
    const addItems = () =>
      api.eval(
        "setItemDetailOpen(true); addItemRow('飯糰', 200, ''); addItemRow('飲料', 130, ''); recomputeTotal();",
      );
    const useCard = () => {
      const sel = doc.querySelector('#f-fxrate');
      sel.value = 'card';
      sel.dispatchEvent(new api.Event('change', { bubbles: true }));
    };
    const saved = () => stored('ledger.v2.records').find((x) => x.scope.trip === 't-jp');

    it('品項加總成為外幣總額，台幣總額照信用卡帳單', () => {
      open();
      pickCurrency('JPY');
      useCard();
      addItems();
      expect(doc.querySelector('#f-total').value).toBe('330');
      input('#f-fxtwd', '75');
      doc.querySelector('#saveBtn').click();
      const r = saved();
      expect(r.total).toBe(75);
      expect(r.items.reduce((n, i) => n + i.price, 0)).toBeCloseTo(75, 2);
      expect(r.fx).toMatchObject({ cur: 'JPY', amount: 330, twd: 75, rateType: 'card' });
      expect(r.fx.orig.items.map((i) => i.price)).toEqual([200, 130]);
    });

    it('用固定匯率時品項也以外幣輸入，台幣自動換算', () => {
      open();
      pickCurrency('JPY');
      addItems();
      expect(doc.querySelector('#f-fxtwd').value).toBe('66');
      doc.querySelector('#saveBtn').click();
      expect(saved().total).toBe(66);
    });

    it('再編輯時品項、總額、台幣都還原成當初的外幣輸入', () => {
      open();
      pickCurrency('JPY');
      useCard();
      addItems();
      input('#f-fxtwd', '75');
      doc.querySelector('#saveBtn').click();
      api.eval(`openSheet('${saved().id}');`);
      const prices = [...doc.querySelectorAll('#itemRows .i-price')].map((e) => e.value);
      expect(prices).toEqual(['200', '130']);
      expect(doc.querySelector('#f-total').value).toBe('330');
      expect(doc.querySelector('#f-fxtwd').value).toBe('75');
    });

    it('重新儲存不會讓金額漂移', () => {
      open();
      pickCurrency('JPY');
      useCard();
      addItems();
      input('#f-fxtwd', '75');
      doc.querySelector('#saveBtn').click();
      const id = saved().id;
      api.eval(`openSheet('${id}');`);
      doc.querySelector('#saveBtn').click();
      expect(saved()).toMatchObject({ total: 75, fx: { amount: 330, twd: 75 } });
    });

    it('清單上顯示外幣金額標籤', () => {
      open();
      pickCurrency('JPY');
      input('#f-total', '3000');
      doc.querySelector('#saveBtn').click();
      api.eval("currentScope = { type: 'overseas', trip: 't-jp' }; renderAll();");
      expect(doc.querySelector('#recordList').textContent).toContain('¥3,000');
    });
  });

  it('記住這趟旅行上次的幣別與匯率', () => {
    open();
    pickCurrency('JPY');
    input('#f-total', '1000');
    doc.querySelector('#saveBtn').click();
    open();
    expect(doc.querySelector('#fxFields').style.display).toBe('block');
    expect(doc.querySelector('#f-fxrate').value).toBe('fx1');
  });

  it('編輯舊的外幣帳目會還原幣別、金額與匯率', () => {
    open();
    pickCurrency('JPY');
    input('#f-total', '3000');
    doc.querySelector('#saveBtn').click();
    const id = stored('ledger.v2.records').find((x) => x.scope.trip === 't-jp').id;
    api.eval(`openSheet('${id}');`);
    expect(doc.querySelector('#f-total').value).toBe('3000');
    expect(doc.querySelector('#f-fxtwd').value).toBe('600');
  });

  it('結算卡：台幣總計、各幣別、換匯餘額', () => {
    open();
    pickCurrency('JPY');
    input('#f-total', '5000');
    const sel = doc.querySelector('#f-fxrate');
    sel.value = 'ex1';
    sel.dispatchEvent(new api.Event('change', { bubbles: true }));
    doc.querySelector('#saveBtn').click();
    api.eval("currentScope = { type: 'overseas', trip: 't-jp' }; renderAll();");
    const card = doc.querySelector('#tripFxCard').textContent;
    expect(card).toContain('$1,000');
    expect(card).toContain('¥5,000');
    expect(card).toContain('機場');
    expect(card).toContain('剩 ¥45,000');
  });

  it('日常情境沒有結算卡', () => {
    api.eval("currentScope = { type: 'daily', trip: null }; renderAll();");
    expect(doc.querySelector('#tripFxCard').innerHTML).toBe('');
  });
});

describe('行程幣別設定', () => {
  it('在出國行程的編輯頁加入幣別與匯率，儲存後寫入 trip.currencies', () => {
    api.eval("openTripSheet(null, 'overseas');");
    doc.querySelector('#t-name').value = '首爾';
    doc.querySelector('#tripFxAddSel').value = 'KRW';
    doc.querySelector('#tripFxAddBtn').click();
    const rate = doc.querySelector('#tripFxList input[data-f=rate]');
    rate.value = '0.023';
    rate.dispatchEvent(new api.Event('input', { bubbles: true }));
    doc.querySelector('#tripSave').click();
    const t = stored('ledger.v2.trips').find((x) => x.name === '首爾');
    expect(t.currencies).toEqual([
      { code: 'KRW', rates: [expect.objectContaining({ type: 'fixed', rate: 0.023 })] },
    ]);
  });

  it('非出國類型不顯示幣別設定', () => {
    api.eval("openTripSheet(null, 'domestic');");
    expect(doc.querySelector('#tripFxBox').style.display).toBe('none');
  });
});
