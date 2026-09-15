/**
 * 特徵化測試：每月固定支出的日期推算。
 * 月底邊界（31 號遇到 2 月）是最容易出錯的地方。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';

let api, close;
beforeAll(() => {
  ({ api, close } = bootLegacyApi());
});
afterAll(() => close());

describe('recurringOccurrenceDate — 月份參數為 0-based', () => {
  it('一般情況直接組出當月日期', () => {
    expect(api.recurringOccurrenceDate(2026, 0, 31)).toBe('2026-01-31');
    expect(api.recurringOccurrenceDate(2026, 4, 15)).toBe('2026-05-15');
  });

  it('指定日超過當月天數時，落在該月最後一天', () => {
    expect(api.recurringOccurrenceDate(2026, 1, 31)).toBe('2026-02-28');
    expect(api.recurringOccurrenceDate(2026, 3, 31)).toBe('2026-04-30');
  });

  it('閏年二月為 29 天', () => {
    expect(api.recurringOccurrenceDate(2024, 1, 31)).toBe('2024-02-29');
  });

  it('日期小於 1 或無效時退回 1 號', () => {
    expect(api.recurringOccurrenceDate(2026, 3, 0)).toBe('2026-04-01');
    expect(api.recurringOccurrenceDate(2026, 3, -5)).toBe('2026-04-01');
    expect(api.recurringOccurrenceDate(2026, 3, undefined)).toBe('2026-04-01');
  });
});
