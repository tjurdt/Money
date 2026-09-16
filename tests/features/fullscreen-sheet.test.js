/**
 * 手機上的新增帳目表單改為全螢幕。
 *
 * 與覆蓋層命中測試一樣，這是版面行為 —— jsdom 沒有版面計算，
 * 只能從樣式規則本身檢查。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STYLE_DIR = resolve(ROOT, 'src/styles');

const allCss = () =>
  readdirSync(STYLE_DIR)
    .filter((f) => f.endsWith('.css') && f !== 'index.css')
    .sort()
    .map((f) => readFileSync(resolve(STYLE_DIR, f), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** 取出手機斷點（max-width ≤ 700px）內、指定選擇器的宣告。 */
function mobileDeclarations(selector) {
  const css = allCss();
  let out = '';
  const re = /@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    if (+m[1] > 700) continue;
    let i = m.index + m[0].length - 1;
    let depth = 0;
    let end = i;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    const block = css.slice(i + 1, end);
    const rr = /([^{}]+)\{([^{}]*)\}/g;
    let r;
    while ((r = rr.exec(block))) {
      if (r[1].trim().replace(/\s+/g, ' ') === selector) out += r[2] + ';';
    }
  }
  return out;
}

const has = (body, prop, value) =>
  new RegExp(`(^|[;{\\s])${prop}\\s*:\\s*${value}\\s*(;|$)`, 'i').test(body);

describe('手機寬度下的 #sheet', () => {
  const decls = mobileDeclarations('#sheet');

  it('從畫面頂端開始', () => {
    expect(has(decls, 'top', '0')).toBe(true);
  });

  it('解除高度上限，佔滿整個視窗', () => {
    expect(has(decls, 'max-height', 'none')).toBe(true);
    expect(/height\s*:\s*100dvh/i.test(decls)).toBe(true);
  });

  it('提供 100vh 後備值，舊瀏覽器不會塌掉', () => {
    // dvh 不支援時會忽略該宣告，因此必須先寫一行 vh。
    const vhIndex = decls.search(/height\s*:\s*100vh/i);
    const dvhIndex = decls.search(/height\s*:\s*100dvh/i);
    expect(vhIndex).toBeGreaterThanOrEqual(0);
    expect(vhIndex).toBeLessThan(dvhIndex);
  });

  it('移除圓角，看起來像獨立頁面', () => {
    expect(has(decls, 'border-radius', '0')).toBe(true);
  });

  it('底部保留安全區內距', () => {
    expect(/padding-bottom\s*:\s*calc\([^)]*safe-area-inset-bottom/i.test(decls)).toBe(true);
  });
});

describe('全螢幕時的細節', () => {
  it('標題列留出瀏海安全區', () => {
    // 狀態列設為 black-translucent，內容會延伸到瀏海底下。
    const decls = mobileDeclarations('#sheet .sheet-hdr');
    expect(/padding-top\s*:\s*calc\([^)]*safe-area-inset-top/i.test(decls)).toBe(true);
  });

  it('隱藏拖曳條 —— 全螢幕沒有往下拖曳關閉的意象', () => {
    const decls = mobileDeclarations('#sheet .grab');
    expect(has(decls, 'display', 'none')).toBe(true);
  });
});

describe('桌面不受影響', () => {
  it('基礎 .sheet 仍是由下方滑入的面板', () => {
    const css = allCss();
    const base = css.match(/(^|\})\s*\.sheet\{([^}]*)\}/);
    expect(base).toBeTruthy();
    expect(/bottom\s*:\s*0/.test(base[2])).toBe(true);
    expect(/max-height\s*:\s*93vh/.test(base[2])).toBe(true);
  });
});
