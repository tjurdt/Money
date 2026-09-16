/**
 * 情境類型定義的單元測試。
 *
 * 這個模組是所有情境判斷的單一事實來源。原本 'domestic' / 'overseas'
 * 硬編碼在 7 個檔案裡，新增一種情境就得逐一找出來改。
 */
import { describe, it, expect } from 'vitest';
import {
  SCOPE_KINDS,
  SCOPE_KIND_LIST,
  TRIP_KINDS,
  STANDING_KINDS,
  DEFAULT_SCOPE_KIND,
  scopeKindMeta,
  isScopeKind,
  isTripKind,
  isStandingKind,
  isScopedToEntry,
  scopeEntryLabel,
  scopeDateRange,
  withinScopeRange,
} from '../../src/domain/scope.js';

describe('情境類型', () => {
  it('包含兩種旅程與一種常設情境', () => {
    expect(TRIP_KINDS).toEqual(['domestic', 'overseas']);
    expect(STANDING_KINDS).toEqual(['standing']);
  });

  it('每種類型都有顯示所需的中繼資料', () => {
    for (const meta of SCOPE_KIND_LIST) {
      expect(meta.label).toBeTruthy();
      expect(meta.emoji).toBeTruthy();
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.namePlaceholder).toBeTruthy();
    }
  });

  it('預設類型是已知類型', () => {
    expect(isScopeKind(DEFAULT_SCOPE_KIND)).toBe(true);
  });

  it('定義是凍結的，避免被意外修改', () => {
    expect(Object.isFrozen(SCOPE_KINDS)).toBe(true);
    expect(Object.isFrozen(SCOPE_KINDS.standing)).toBe(true);
  });
});

describe('類型判斷', () => {
  it('旅程類型', () => {
    expect(isTripKind('domestic')).toBe(true);
    expect(isTripKind('overseas')).toBe(true);
    expect(isTripKind('standing')).toBe(false);
  });

  it('常設類型', () => {
    expect(isStandingKind('standing')).toBe(true);
    expect(isStandingKind('domestic')).toBe(false);
  });

  it('未知類型都不成立', () => {
    expect(isScopeKind('亂寫')).toBe(false);
    expect(isTripKind('亂寫')).toBe(false);
    expect(isStandingKind('亂寫')).toBe(false);
  });

  it('未知類型的中繼資料退回預設，不會是 undefined', () => {
    // 畫面上寧可顯示預設 emoji，也不要出現空白或當掉。
    expect(scopeKindMeta('亂寫')).toBe(SCOPE_KINDS[DEFAULT_SCOPE_KIND]);
    expect(scopeKindMeta(undefined).emoji).toBeTruthy();
  });
});

describe('情境歸屬', () => {
  it('日常與全部都不算綁定到特定情境', () => {
    expect(isScopedToEntry({ type: 'daily' })).toBe(false);
    expect(isScopedToEntry({ type: 'all' })).toBe(false);
    expect(isScopedToEntry(null)).toBe(false);
  });

  it('旅程與常設情境都算', () => {
    expect(isScopedToEntry({ type: 'domestic' })).toBe(true);
    expect(isScopedToEntry({ type: 'standing' })).toBe(true);
  });
});

describe('顯示名稱', () => {
  it('帶上該類型的 emoji', () => {
    expect(scopeEntryLabel({ name: '日本', kind: 'overseas' })).toBe('✈️ 日本');
    expect(scopeEntryLabel({ name: '孝親費', kind: 'standing' })).toBe('📌 孝親費');
  });

  it('情境被刪除時給出可辨識的文字', () => {
    expect(scopeEntryLabel(null)).toContain('已刪除');
  });

  it('沒有名稱時不會顯示 undefined', () => {
    expect(scopeEntryLabel({ kind: 'standing' })).toBe('📌 未命名');
  });
});

describe('時間區間', () => {
  it('沒有設定日期時回傳 null —— 代表不限時間', () => {
    // 常設情境多半不設區間（孝親費是持續的）。
    // null 與「空區間」意義不同：前者不限，後者會篩掉所有資料。
    expect(scopeDateRange({ name: '孝親費', kind: 'standing' })).toBeNull();
  });

  it('有起訖時回傳區間', () => {
    expect(scopeDateRange({ start: '2026-04-08', end: '2026-04-15' })).toEqual({
      from: '2026-04-08',
      to: '2026-04-15',
    });
  });

  it('只填一端也算有效區間', () => {
    expect(scopeDateRange({ start: '2026-04-08' })).toEqual({ from: '2026-04-08', to: '' });
    expect(scopeDateRange({ end: '2026-04-15' })).toEqual({ from: '', to: '2026-04-15' });
  });
});

describe('日期是否落在情境區間內', () => {
  const trip = { start: '2026-04-08', end: '2026-04-15' };

  it('區間內為真', () => {
    expect(withinScopeRange(trip, '2026-04-10')).toBe(true);
    expect(withinScopeRange(trip, '2026-04-08')).toBe(true);
    expect(withinScopeRange(trip, '2026-04-15')).toBe(true);
  });

  it('區間外為假', () => {
    expect(withinScopeRange(trip, '2026-04-07')).toBe(false);
    expect(withinScopeRange(trip, '2026-04-16')).toBe(false);
  });

  it('沒有設定區間時一律為真', () => {
    expect(withinScopeRange({ name: '孝親費', kind: 'standing' }, '2020-01-01')).toBe(true);
  });

  it('只有開始日時，之後的日期都算', () => {
    expect(withinScopeRange({ start: '2026-04-08' }, '2030-01-01')).toBe(true);
    expect(withinScopeRange({ start: '2026-04-08' }, '2026-04-07')).toBe(false);
  });
});
