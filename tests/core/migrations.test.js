/**
 * 遷移的單元測試。
 *
 * 每條遷移都必須涵蓋三種情況：需要轉換、已經轉換過（冪等）、資料無關時不動作。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MIGRATIONS,
  runMigrations,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
} from '../../src/core/migrations.js';
import { K, load, save, __resetMemStore } from '../../src/core/storage.js';

const byId = (id) => MIGRATIONS.find((m) => m.id === id);

beforeEach(() => __resetMemStore());

describe('遷移清單', () => {
  it('每條遷移都有 id、說明、applies 與 run', () => {
    for (const m of MIGRATIONS) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.description).toBe('string');
      expect(typeof m.applies).toBe('function');
      expect(typeof m.run).toBe('function');
    }
  });

  it('id 不重複', () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('v1-records-to-v2', () => {
  const m = () => byId('v1-records-to-v2');
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
  };

  it('有 v1 資料且無 v2 時需要執行', () => {
    save('ledger.records.v1', [v1Record]);
    expect(m().applies()).toBe(true);
  });

  it('轉成 v2 結構', () => {
    save('ledger.records.v1', [v1Record]);
    m().run();
    const [r] = load(K.rec, []);
    expect(r.id).toBe('old-1');
    expect(r.kind).toBe('expense');
    expect(r.total).toBe(45);
    expect(r.catMode).toBe('whole');
    expect(r.scope).toEqual({ type: 'daily', trip: null });
    expect(r.items).toEqual([{ name: '蛋餅', price: 45, category: null, sub: null }]);
  });

  it('一併搬移舊的分類與付款方式', () => {
    save('ledger.records.v1', [v1Record]);
    save('ledger.cats.v1', ['餐食', '交通']);
    save('ledger.pays.v1', ['現金']);
    m().run();
    expect(load(K.ce, [])).toEqual(['餐食', '交通']);
    expect(load(K.pay, [])).toEqual(['現金']);
  });

  it('已有 v2 資料時不執行 —— 不覆蓋使用者現有帳本', () => {
    save(K.rec, [{ id: 'keep-me' }]);
    save('ledger.records.v1', [v1Record]);
    expect(m().applies()).toBe(false);
  });

  it('沒有 v1 資料時不執行', () => {
    expect(m().applies()).toBe(false);
  });
});

describe('lending-to-split', () => {
  const m = () => byId('lending-to-split');
  const legacy = (lending, total) => ({
    id: 'lg',
    kind: 'expense',
    date: '2026-01-01',
    total,
    lending,
    counterpart: '小明',
    settled: false,
  });

  it('代墊（advance）轉成「我付款、我不負擔」', () => {
    save(K.rec, [legacy('advance', 300)]);
    m().run();
    expect(load(K.rec, [])[0].split).toEqual({
      partner: '小明',
      payer: 'me',
      myShare: 0,
      preset: 'none',
      settled: false,
    });
  });

  it('欠款（debt）轉成「對方付款、我全額負擔」', () => {
    save(K.rec, [legacy('debt', 300)]);
    m().run();
    expect(load(K.rec, [])[0].split).toEqual({
      partner: '小明',
      payer: 'other',
      myShare: 300,
      preset: 'all',
      settled: false,
    });
  });

  it('沒有 lending 的帳目 split 補成 null', () => {
    save(K.rec, [legacy(null, 300)]);
    m().run();
    const [r] = load(K.rec, []);
    expect(r.split).toBeNull();
    expect(r.sub).toBeNull();
  });

  it('冪等：已經轉換過就不再需要執行', () => {
    save(K.rec, [legacy('advance', 300)]);
    m().run();
    expect(m().applies()).toBe(false);
  });

  it('不會覆蓋已經存在的 split', () => {
    const withSplit = {
      ...legacy(null, 300),
      split: { partner: '阿華', payer: 'me', myShare: 150, preset: 'even', settled: false },
      sub: null,
    };
    save(K.rec, [withSplit]);
    m().run();
    expect(load(K.rec, [])[0].split.partner).toBe('阿華');
  });

  it('records 不是陣列時不執行 —— 交給 schema 驗證處理', () => {
    save(K.rec, { 壞掉: true });
    expect(m().applies()).toBe(false);
  });
});

describe('runMigrations', () => {
  it('回報實際執行了哪些遷移', () => {
    save('ledger.records.v1', [{ id: 'a', total: 1, date: '2025-01-01' }]);
    const { applied, failed } = runMigrations();
    expect(applied).toContain('v1-records-to-v2');
    expect(failed).toEqual([]);
  });

  it('沒有需要執行的遷移時回傳空清單', () => {
    expect(runMigrations().applied).toEqual([]);
  });

  it('記錄目前的資料格式版本', () => {
    runMigrations();
    expect(load(SCHEMA_VERSION_KEY, null)).toBe(SCHEMA_VERSION);
  });

  it('單一遷移失敗不會中止其餘遷移', () => {
    // 一條遷移壞掉不該讓整個 app 無法啟動。
    const broken = {
      id: 'broken',
      description: '測試用',
      applies: () => true,
      run() {
        throw new Error('故意失敗');
      },
    };
    MIGRATIONS.unshift(broken);
    try {
      save('ledger.records.v1', [{ id: 'a', total: 1, date: '2025-01-01' }]);
      const { applied, failed } = runMigrations();
      expect(failed).toEqual([{ id: 'broken', error: '故意失敗' }]);
      expect(applied).toContain('v1-records-to-v2');
    } finally {
      MIGRATIONS.shift();
    }
  });
});
