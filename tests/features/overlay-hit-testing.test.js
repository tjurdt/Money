/**
 * 隱藏的覆蓋層不得攔截點擊。
 *
 * 曾經出過事：把北捷面板改成置中淡入時，只設了 opacity:0 就當作隱藏。
 * 但 opacity:0 的元素仍然存在於版面上、仍然接收點擊 ——
 * 結果是一個看不見的 420px 區塊壓在畫面正中央，
 * 把底下清單的點擊與新增表單的滾動全部吃掉。
 *
 * 畫面上「看起來正常」，所以肉眼檢查與一般的 DOM 測試都抓不到；
 * 這種錯誤只能從樣式規則本身檢查。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STYLE_DIR = resolve(ROOT, 'src/styles');

/** 把所有樣式檔接成一份，順序與瀏覽器實際看到的一致。 */
function allCss() {
  return readdirSync(STYLE_DIR)
    .filter((f) => f.endsWith('.css') && f !== 'index.css')
    .sort()
    .map((f) => readFileSync(resolve(STYLE_DIR, f), 'utf8'))
    .join('\n');
}

/**
 * 拆出「選擇器 → 宣告」的清單。
 *
 * 會略過 @keyframes 的內容：那裡的 opacity:0 是動畫的一個時間點，
 * 不是「隱藏狀態」，不適用本檔的規則。
 */
function rules() {
  const css = allCss().replace(/\/\*[\s\S]*?\*\//g, '');

  // 先把 @keyframes 整塊移除（含其巢狀大括號）。
  let cleaned = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@keyframes', i);
    if (at < 0) {
      cleaned += css.slice(i);
      break;
    }
    cleaned += css.slice(i, at);
    let j = css.indexOf('{', at);
    let depth = 0;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }

  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cleaned))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
}

/**
 * 某個選擇器最終生效的宣告。
 *
 * 同一個選擇器可能散落在多個覆寫層（這份 CSS 有 v3/v7/v22/v23 四層），
 * 因此必須把所有同名規則合起來看，而不是只取第一條。
 */
function declarationsFor(selector) {
  return rules()
    .filter((r) => r.selector === selector)
    .map((r) => r.body)
    .join(';');
}

const has = (body, prop, value) =>
  new RegExp(`(^|[;{\\s])${prop}\\s*:\\s*${value}\\s*(;|$)`, 'i').test(body);

describe('以 opacity:0 隱藏的元素', () => {
  it('都必須同時關閉命中測試', () => {
    const offenders = rules()
      .filter((r) => has(r.body, 'opacity', '0'))
      // 已經被位移出畫面的（例如 translateY(100%)）不會擋到任何東西
      .filter((r) => !/transform\s*:\s*[^;]*translate[^;]*100%/i.test(r.body))
      // 同一選擇器的其他層可能補上了 pointer-events
      .filter((r) => !has(declarationsFor(r.selector), 'pointer-events', 'none'))
      .map((r) => r.selector);

    expect(
      offenders,
      'opacity:0 的元素仍然接收點擊。請加上 pointer-events:none（通常也要一併加 visibility:hidden）',
    ).toEqual([]);
  });
});

describe('北捷置中面板', () => {
  const hidden = () => declarationsFor('.mrt-sheet');
  const shown = () => declarationsFor('.mrt-sheet.show');

  it('未開啟時不接收點擊', () => {
    expect(has(hidden(), 'pointer-events', 'none')).toBe(true);
  });

  it('未開啟時不可見', () => {
    expect(has(hidden(), 'visibility', 'hidden')).toBe(true);
  });

  it('開啟時恢復可見與可點擊', () => {
    expect(has(shown(), 'pointer-events', 'auto')).toBe(true);
    expect(has(shown(), 'visibility', 'visible')).toBe(true);
  });
});

describe('由下方滑入的 sheet', () => {
  it('靠位移移出畫面，因此不需要額外關閉命中測試', () => {
    // 記錄這個既有做法，避免日後有人「順手」把它也改成 opacity 淡入而重蹈覆轍。
    const base = declarationsFor('.sheet');
    expect(/transform\s*:\s*translateY\(100%\)/i.test(base)).toBe(true);
  });
});
