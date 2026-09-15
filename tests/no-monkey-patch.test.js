/**
 * 「禁止 monkey-patch」的自動化守衛。
 *
 * CLAUDE.md 第 2 條規則原本只是文件，靠人記得遵守。
 * P2 把既有的 8 處包裝併回本體後，這裡讓規則變成 CI 會擋下的檢查 ——
 * 否則下一次疊加新版時，同樣的結構會再長回來。
 *
 * 被禁止的樣式：
 *   const _renderCharts_v24 = renderCharts;
 *   renderCharts = function () { _renderCharts_v24(); ... };
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEGACY_FILES, LEGACY_DIR, readLegacyBundle } from '../build/legacy-bundle.js';

describe('不得出現版本疊加式的 monkey-patch', () => {
  it('沒有 `const _xxx_vNN = fn` 形式的舊函式備份', () => {
    const offenders = [];
    for (const file of LEGACY_FILES) {
      const src = readFileSync(resolve(LEGACY_DIR, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        if (/^\s*(const|let|var)\s+_\w*_v\d+\w*\s*=/.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders, '要改行為請直接改本體函式，不要再包一層').toEqual([]);
  });

  it('沒有對既有具名函式的重新賦值', () => {
    // `renderCharts = function () {...}` —— 覆寫掉一個 function 宣告。
    const bundle = readLegacyBundle();
    const declared = new Set();
    for (const m of bundle.matchAll(/^function\s+(\w+)\s*\(/gm)) declared.add(m[1]);

    const offenders = [];
    for (const file of LEGACY_FILES) {
      const src = readFileSync(resolve(LEGACY_DIR, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        const m = line.match(/^\s*(\w+)\s*=\s*function\b/);
        if (m && declared.has(m[1])) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders, '不要用賦值覆寫已宣告的函式').toEqual([]);
  });

  it('glue 檔案不應再成長 —— 它們是待消化的過渡層', () => {
    // P2 把 v7/v23 的包裝併回本體後，這兩個檔案只剩自有邏輯與事件綁定。
    // 設定上限是為了讓「又往 glue 檔塞東西」這件事被注意到。
    const size = (f) => readFileSync(resolve(LEGACY_DIR, f), 'utf8').split('\n').length;
    expect(size('26-glue-v7-ux.js')).toBeLessThan(200);
    expect(size('27-glue-v23.js')).toBeLessThan(400);
  });
});
