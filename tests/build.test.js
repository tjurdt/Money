/**
 * 建置驗證：對 dist/ 產物跑一遍核心特徵化測試。
 *
 * 目的是證明「Vite 打包沒有改變行為」—— 這是從單檔上傳切換到建置部署時，
 * 最需要被自動化守住的一件事。
 *
 * dist/ 不存在時整個檔案會被跳過（例如只跑單元測試、還沒建置的情境）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bootLegacyApi } from './harness.js';
import * as F from './fixtures/records.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hasDist = existsSync(resolve(ROOT, 'dist/index.html'));

describe.skipIf(!hasDist)('dist/ 建置產物', () => {
  let api, grab, close;
  beforeAll(() => { ({ api, grab, close } = bootLegacyApi({ entry: 'dist/index.html' })); });
  afterAll(() => close?.());

  it('建置產物能正常啟動', () => {
    expect(api.document.querySelector('#recordList').innerHTML).toContain('這裡還沒有帳目');
  });

  it('分帳運算與原始碼一致', () => {
    expect(api.myShareOf(F.splitEven)).toBe(600);
    expect(api.splitBalance(F.splitOtherPaid)).toBe(-350);
    expect(api.splitRatio(F.perItemSplit)).toBe(0.4);
  });

  it('折扣引擎與原始碼一致', () => {
    const items = [
      { lineId: 'L1', price: 120, qty: 1 },
      { lineId: 'L2', price: 180, qty: 1 },
      { lineId: 'L3', price: 100, qty: 2 },
    ];
    const p = api.calculateDiscountPlan(items, 0, [
      { id: 'd1', type: 'order_percent', mode: 'stack', rate: 8, createdAt: 1 },
      { id: 'd2', type: 'fixed', mode: 'stack', amount: 50, createdAt: 2 },
    ]);
    expect(p.finalTotal).toBe(270);
  });

  it('統計聚合與原始碼一致', () => {
    expect(api.expenseContribs(F.perItemSplit)).toEqual([
      { category: '餐食', sub: '早餐', amount: 40 },
      { category: '日用品', sub: '', amount: 120 },
      { category: '日用品', sub: '', amount: 40 },
    ]);
  });

  it('格式化工具與原始碼一致', () => {
    expect(grab('nf')(1234.5)).toBe('$1,235');
    expect(grab('ymKey')('2026-03-05')).toBe('2026-03');
  });

  it('儲存鍵名沒有在打包過程中被改動', () => {
    expect(grab('K').rec).toBe('ledger.v2.records');
  });
});
