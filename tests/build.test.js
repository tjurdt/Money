/**
 * 建置驗證：對 dist/ 產物跑一遍核心特徵化測試。
 *
 * 目的是證明「Vite 打包沒有改變行為」—— 這是從單檔上傳切換到建置部署時，
 * 最需要被自動化守住的一件事。
 *
 * dist/ 不存在時整個檔案會被跳過（例如只跑單元測試、還沒建置的情境）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bootLegacyApi } from './harness.js';
import * as F from './fixtures/records.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist/index.html');
const hasDist = existsSync(DIST);

/**
 * dist/ 過期偵測。
 *
 * 曾經出過事：src/ 改動後沒重新建置，這些測試仍對舊產物跑出全綠，
 * 讓一個會讓 app 完全無法啟動的 bug（$$ 被改寫成 $）溜過本地驗證。
 * 現在只要產物比原始碼舊就直接失敗。
 */
function newestSourceMtime() {
  const walk = (dir) => {
    let newest = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const p = resolve(dir, e.name);
      newest = Math.max(newest, e.isDirectory() ? walk(p) : statSync(p).mtimeMs);
    }
    return newest;
  };
  return Math.max(
    statSync(resolve(ROOT, 'index.html')).mtimeMs,
    walk(resolve(ROOT, 'src')),
    walk(resolve(ROOT, 'build')),
  );
}

describe.skipIf(!hasDist)('dist/ 建置產物', () => {
  let api, grab, close;

  it('產物不得比原始碼舊（否則以下測試等於在驗證過期的東西）', () => {
    const distAge = statSync(DIST).mtimeMs;
    const srcAge = newestSourceMtime();
    expect(
      distAge >= srcAge,
      `dist/ 比原始碼舊 ${Math.round((srcAge - distAge) / 1000)} 秒，請先執行 npm run build`,
    ).toBe(true);
  });
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

/**
 * Service worker 的快取版本化。
 *
 * 曾經出過事：stamp-build.js 用 replace() 只替換第一個出現處，而那是檔頭註解，
 * 真正的 const 沒被換到，cache 名稱固定成 'ledger-shell-__BUILD_ID__'，
 * 版本化完全失效卻沒有任何徵兆。以下測試就是為了讓這種情況被 CI 擋下。
 */
describe.skipIf(!hasDist)('dist/ledger-sw.js 快取版本化', () => {
  const sw = () => readFileSync(resolve(ROOT, 'dist/ledger-sw.js'), 'utf8');

  it('建置產物內不得殘留任何佔位符', () => {
    expect(sw()).not.toContain('__BUILD_ID__');
  });

  it('BUILD_ID 常數被替換成 12 位十六進位雜湊', () => {
    expect(sw()).toMatch(/^const BUILD_ID = '[0-9a-f]{12}';$/m);
  });

  it('cache 名稱由 BUILD_ID 組成', () => {
    expect(sw()).toContain("const CACHE = 'ledger-shell-' + BUILD_ID;");
  });
});
