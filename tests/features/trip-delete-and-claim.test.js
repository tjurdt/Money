/**
 * 行程的刪除與新增。
 *
 * 回歸：刪除行程後重新整理又跑出來 —— 雲端同步合併行程是取聯集，
 * 單純從本機移除會被雲端的副本補回來。刪除必須留下墓碑，且合併要尊重它。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootLegacyApi } from '../harness.js';

const TRIP = { id: 't-jp', name: '日本', kind: 'overseas', start: '2026-04-08', end: '2026-04-15' };
const REC = (id, trip, date = '2026-04-10') => ({
  id,
  kind: 'expense',
  date,
  total: 100,
  scope: trip ? { type: 'overseas', trip } : { type: 'daily', trip: null },
  store: '店',
  payment: '現金',
  items: [],
  category: '餐食',
  sub: null,
  catMode: 'whole',
  hashtags: [],
  note: '',
  split: null,
  inv: null,
  createdAt: 1,
});

let api, doc, close;
const boot = (storage = {}, confirmAnswer = true) => {
  ({ api, close } = bootLegacyApi({
    storage: {
      'ledger.v23.seeded': '1',
      'ledger.v2.catsExpense': ['餐食'],
      'ledger.v2.payments': ['現金'],
      ...storage,
    },
  }));
  doc = api.document;
  api.confirm = () => confirmAnswer;
};
const stored = (key) => JSON.parse(api.localStorage.getItem(key));
afterEach(() => close());

describe('刪除行程', () => {
  beforeEach(() =>
    boot({
      'ledger.v2.trips': [TRIP],
      'ledger.v2.records': [REC('in-trip', 't-jp'), REC('daily', null)],
    }),
  );

  it('行程從儲存中移除，帳目自動歸入日常', () => {
    api.eval("openTripSheet('t-jp');");
    doc.querySelector('#tripDelete').click();
    expect(stored('ledger.v2.trips')).toEqual([]);
    const moved = stored('ledger.v2.records').find((r) => r.id === 'in-trip');
    expect(moved.scope).toEqual({ type: 'daily', trip: null });
  });

  it('留下墓碑，並且目前所在的情境退回日常', () => {
    api.eval("currentScope = { type: 'overseas', trip: 't-jp' }; openTripSheet('t-jp');");
    doc.querySelector('#tripDelete').click();
    expect(stored('ledger.v2.settings').deletedTripIds).toEqual(['t-jp']);
    expect(api.store.get('currentScope')).toEqual({ type: 'daily', trip: null });
  });

  it('按取消不刪除', () => {
    api.confirm = () => false;
    api.eval("openTripSheet('t-jp');");
    doc.querySelector('#tripDelete').click();
    expect(stored('ledger.v2.trips')).toHaveLength(1);
  });

  it('回歸：與仍帶著該行程的雲端資料合併後，行程不會復活', () => {
    const cloud = {
      records: [REC('in-trip', 't-jp'), REC('daily', null)],
      trips: [TRIP],
      settings: {},
    };
    const local = api.eval('packLedger()');
    api.eval("openTripSheet('t-jp');");
    doc.querySelector('#tripDelete').click();
    const after = api.eval('packLedger()');
    api.cloud = cloud;
    api.after = after;
    const merged = api.eval('mergeLedgerThreeWay(after, cloud, makeBaseSnapshot(cloud))').data;
    expect(local.trips).toHaveLength(1);
    expect(merged.trips).toEqual([]);
    expect(merged.records.find((r) => r.id === 'in-trip').scope.type).toBe('daily');
    expect(merged.settings.deletedTripIds).toEqual(['t-jp']);
  });

  it('回歸：直接載入仍含該行程的雲端快照時，墓碑一樣生效', () => {
    const snap = api.eval('packLedger()');
    snap.trips = [TRIP];
    snap.settings = { deletedTripIds: ['t-jp'] };
    snap.records = [REC('in-trip', 't-jp')];
    api.snap = snap;
    const n = api.eval('normalizeLedger(snap)');
    expect(n.trips).toEqual([]);
    expect(n.records[0].scope.type).toBe('daily');
  });
});

describe('新增行程時納入既有消費', () => {
  const fill = () => {
    api.eval("openTripSheet(null, 'overseas');");
    doc.querySelector('#t-name').value = '四國';
    doc.querySelector('#t-start').value = '2026-05-01';
    doc.querySelector('#t-end').value = '2026-05-05';
  };
  const base = {
    'ledger.v2.records': [
      REC('in-range', null, '2026-05-02'),
      REC('out-range', null, '2026-06-02'),
    ],
  };

  it('選擇納入：區間內的日常帳目移進新行程，區間外不動', () => {
    boot(base, true);
    fill();
    doc.querySelector('#tripSave').click();
    const tripId = stored('ledger.v2.trips')[0].id;
    const recs = stored('ledger.v2.records');
    expect(recs.find((r) => r.id === 'in-range').scope.trip).toBe(tripId);
    expect(recs.find((r) => r.id === 'out-range').scope.type).toBe('daily');
  });

  it('選擇不納入：帳目維持在日常', () => {
    boot(base, false);
    fill();
    doc.querySelector('#tripSave').click();
    expect(stored('ledger.v2.trips')).toHaveLength(1);
    expect(stored('ledger.v2.records').every((r) => r.scope.type === 'daily')).toBe(true);
  });

  it('區間內沒有日常帳目時不詢問', () => {
    boot({ 'ledger.v2.records': [REC('x', null, '2026-01-01')] });
    let asked = false;
    api.confirm = () => ((asked = true), true);
    fill();
    doc.querySelector('#tripSave').click();
    expect(asked).toBe(false);
  });
});
