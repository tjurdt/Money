/**
 * 特徵化測試：儲存層、資料遷移與正規化。
 *
 * 這是 P5（資料安全補強）的基準線。目前的遷移散落在兩個立即執行函式裡、
 * 沒有版本號、失敗時靜默跳過；重構成 migrations.js 後行為必須與此處一致。
 */
import { describe, it, expect } from 'vitest';
import { bootLegacyApi } from '../harness.js';

/** 讀出 app 啟動後實際存進 localStorage 的內容。 */
const readBack = (api, key) => JSON.parse(api.localStorage.getItem(key));

describe('儲存鍵名', () => {
  it('K 常數維持既有鍵名（改動會讓既有使用者資料消失）', () => {
    const { grab, close } = bootLegacyApi();
    expect(grab('K')).toEqual({
      rec: 'ledger.v2.records',
      ce: 'ledger.v2.catsExpense',
      ci: 'ledger.v2.catsIncome',
      pay: 'ledger.v2.payments',
      trips: 'ledger.v2.trips',
      scope: 'ledger.v2.scope',
      set: 'ledger.v2.settings',
      sub: 'ledger.v2.subcats',
      prices: 'ledger.v2.prices',
      twse: 'ledger.v2.twse',
      cc: 'ledger.v2.catColors',
    });
    close();
  });
});

describe('v1 → v2 遷移', () => {
  const v1Record = {
    id: 'old-1',
    createdAt: 1600000000000,
    date: '2025-06-01',
    store: '早餐店',
    payment: '現金',
    item: '蛋餅',
    total: 45,
    category: '餐食',
    status: null,
    counterpart: '',
    settled: false,
  };

  it('把舊格式帳目轉成 v2 結構', () => {
    const { api, close } = bootLegacyApi({
      storage: {
        'ledger.records.v1': [v1Record],
        'ledger.cats.v1': ['餐食', '交通'],
        'ledger.pays.v1': ['現金'],
        'ledger.v23.seeded': '1',
      },
    });
    const [r] = readBack(api, 'ledger.v2.records');
    expect(r.id).toBe('old-1');
    expect(r.kind).toBe('expense');
    expect(r.total).toBe(45);
    expect(r.scope).toEqual({ type: 'daily', trip: null });
    expect(r.catMode).toBe('whole');
    expect(r.items).toEqual([{ name: '蛋餅', price: 45, category: null, sub: null }]);
    close();
  });

  it('一併搬移舊的分類與付款方式', () => {
    const { api, close } = bootLegacyApi({
      storage: {
        'ledger.records.v1': [v1Record],
        'ledger.cats.v1': ['餐食', '交通'],
        'ledger.pays.v1': ['現金'],
        'ledger.v23.seeded': '1',
      },
    });
    expect(readBack(api, 'ledger.v2.catsExpense')).toEqual(['餐食', '交通']);
    expect(readBack(api, 'ledger.v2.payments')).toEqual(['現金']);
    close();
  });

  it('已有 v2 資料時不覆寫（遷移只跑一次）', () => {
    const existing = [
      { id: 'keep-me', kind: 'expense', date: '2026-01-01', total: 1, items: [], split: null },
    ];
    const { api, close } = bootLegacyApi({
      storage: {
        'ledger.v2.records': existing,
        'ledger.records.v1': [v1Record],
        'ledger.v23.seeded': '1',
      },
    });
    expect(readBack(api, 'ledger.v2.records').map((r) => r.id)).toEqual(['keep-me']);
    close();
  });
});

describe('lending → split 正規化', () => {
  const legacy = (lending, total) => ({
    id: 'lg',
    createdAt: 1,
    date: '2026-01-01',
    kind: 'expense',
    scope: { type: 'daily', trip: null },
    store: 'x',
    payment: '現金',
    hashtags: [],
    note: '',
    items: [],
    category: '餐食',
    catMode: 'whole',
    total,
    lending,
    counterpart: '小明',
    settled: false,
    inv: null,
  });

  it('代墊（advance）轉成「我付款、我不負擔」', () => {
    const { api, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': [legacy('advance', 300)], 'ledger.v23.seeded': '1' },
    });
    const [r] = readBack(api, 'ledger.v2.records');
    expect(r.split).toEqual({
      partner: '小明',
      payer: 'me',
      myShare: 0,
      preset: 'none',
      settled: false,
    });
    close();
  });

  it('欠款（debt）轉成「對方付款、我全額負擔」', () => {
    const { api, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': [legacy('debt', 300)], 'ledger.v23.seeded': '1' },
    });
    const [r] = readBack(api, 'ledger.v2.records');
    expect(r.split).toEqual({
      partner: '小明',
      payer: 'other',
      myShare: 300,
      preset: 'all',
      settled: false,
    });
    close();
  });

  it('沒有 lending 的帳目 split 補成 null，sub 補成 null', () => {
    const { api, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': [legacy(null, 300)], 'ledger.v23.seeded': '1' },
    });
    const [r] = readBack(api, 'ledger.v2.records');
    expect(r.split).toBeNull();
    expect(r.sub).toBeNull();
    close();
  });

  it('已經有 split 的帳目不被動到', () => {
    const withSplit = {
      ...legacy(null, 300),
      split: { partner: '阿華', payer: 'me', myShare: 150, preset: 'even', settled: false },
      sub: null,
    };
    const { api, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': [withSplit], 'ledger.v23.seeded': '1' },
    });
    const [r] = readBack(api, 'ledger.v2.records');
    expect(r.split.partner).toBe('阿華');
    expect(r.split.myShare).toBe(150);
    close();
  });
});

describe('首次啟動的預設值', () => {
  it('全新使用者會拿到預設分類與付款方式', () => {
    const { grab, close } = bootLegacyApi();
    expect(grab('catsExpense')).toContain('餐食');
    expect(grab('catsIncome')).toContain('薪資');
    expect(grab('payments')).toContain('現金');
    close();
  });

  it('已種子化過就不再重複塞入預設值', () => {
    const { grab, close } = bootLegacyApi({
      storage: { 'ledger.v23.seeded': '1', 'ledger.v2.catsExpense': ['自訂'] },
    });
    expect(grab('catsExpense')).toEqual(['自訂']);
    close();
  });
});

describe('毀損資料的容錯', () => {
  it('localStorage 內是壞掉的 JSON 時退回預設值而非爆炸', () => {
    const { grab, errors, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': '{not json', 'ledger.v23.seeded': '1' },
    });
    expect(errors).toEqual([]);
    expect(grab('records')).toEqual([]);
    close();
  });

  /**
   * 這裡原本記錄的是一個嚴重缺陷（見 P0／ARCHITECTURE.md）：
   * load() 只防 JSON 解析失敗、不檢查型別，若 ledger.v2.records 存到
   * 「合法 JSON 但不是陣列」的值，啟動時會拋 records.forEach is not a function，
   * 整段腳本中止 —— 事件監聽全未註冊，app 變成沒有反應的空殼。
   *
   * P5 已修復：載入時經過 schema 驗證，無法使用的值送進隔離區保存，
   * 該鍵改用預設值，確保 app 一定能啟動。
   */
  it('帳目不是陣列時仍能正常啟動', () => {
    const { errors, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': { oops: true }, 'ledger.v23.seeded': '1' },
    });
    expect(errors).toEqual([]);
    close();
  });

  it('啟動後畫面正常、按鈕有反應', () => {
    const { api, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': { oops: true }, 'ledger.v23.seeded': '1' },
    });
    const doc = api.document;
    expect(doc.querySelector('#recordList').innerHTML).toContain('這裡還沒有帳目');
    doc.querySelector('#fab').click();
    expect(doc.querySelector('#sheet').classList.contains('show')).toBe(true);
    close();
  });

  it('無法使用的原始值被保存在隔離區，而不是被刪掉', () => {
    // 這些是使用者的帳本資料，就算目前程式碼看不懂也不該直接丟棄。
    const { api, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': { oops: true }, 'ledger.v23.seeded': '1' },
    });
    const quarantined = api.listQuarantine();
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].quarantineKey).toMatch(/^ledger[.]quarantine[.]ledger[.]v2[.]records[.]/);
    expect(quarantined[0].key).toBe('ledger.v2.records');
    expect(quarantined[0].value).toEqual({ oops: true });
    close();
  });

  it('資料問題會被記錄下來供介面顯示', () => {
    const { api, close } = bootLegacyApi({
      storage: { 'ledger.v2.records': { oops: true }, 'ledger.v23.seeded': '1' },
    });
    const issues = api.store.getIntegrityIssues();
    expect(issues).toContainEqual(expect.objectContaining({ key: 'records', kind: 'quarantined' }));
    close();
  });

  it('陣列中個別壞掉的項目被剔除，其餘資料保留', () => {
    const good = {
      id: 'keep',
      kind: 'expense',
      date: '2026-03-05',
      total: 100,
      items: [],
      split: null,
      scope: { type: 'daily', trip: null },
    };
    const { api, close } = bootLegacyApi({
      storage: {
        'ledger.v2.records': [good, null, 'not a record', { 沒有id: true }],
        'ledger.v23.seeded': '1',
      },
    });
    const records = api.store.get('records');
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('keep');
    close();
  });

  it('對照組：資料正常時會渲染空狀態且 FAB 可開啟表單', () => {
    const { api, close } = bootLegacyApi({ storage: { 'ledger.v23.seeded': '1' } });
    const doc = api.document;
    expect(doc.querySelector('#recordList').innerHTML).toContain('這裡還沒有帳目');
    doc.querySelector('#fab').click();
    expect(doc.querySelector('#sheet').classList.contains('show')).toBe(true);
    close();
  });
});
