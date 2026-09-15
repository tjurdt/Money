/**
 * legacy bundle 的結構守衛。
 *
 * 這些測試不驗證 app 行為（那是 tests/legacy/ 的工作），而是守住「拆檔這件事本身」：
 * manifest 與實際檔案不同步、或注入過程把程式碼改壞，都會在這裡被擋下。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { LEGACY_FILES, LEGACY_DIR, readLegacyBundle } from '../build/legacy-bundle.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('manifest 與 src/legacy/ 必須一致', () => {
  const onDisk = readdirSync(LEGACY_DIR).filter((f) => f.endsWith('.js')).sort();

  it('沒有孤兒檔案：src/legacy/ 內的每個檔案都列在 manifest 中', () => {
    // 漏列的檔案不會被載入，而且完全沒有錯誤訊息 —— 必須自動擋下。
    expect(onDisk.filter((f) => !LEGACY_FILES.includes(f))).toEqual([]);
  });

  it('沒有幽靈項目：manifest 列出的檔案都真實存在', () => {
    expect(LEGACY_FILES.filter((f) => !onDisk.includes(f))).toEqual([]);
  });

  it('manifest 的順序即載入順序，與檔名前綴一致', () => {
    // 順序是語意的一部分（覆寫層、相依的初始化），排錯會改變行為。
    expect(LEGACY_FILES).toEqual([...LEGACY_FILES].sort());
  });
});

describe('串接結果的完整性', () => {
  const bundle = readLegacyBundle();

  it('保留 $$ 選擇器輔助函式', () => {
    // 曾經出過事：用字串當 replace() 的替換值，其中的 $$ 被當成跳脫序列，
    // `const $$ = s => document.querySelectorAll(s)` 被改寫成 `const $ = ...`，
    // 造成重複宣告的 SyntaxError，整個 app 變成空白頁。
    expect(bundle).toContain('$$=s=>document.querySelectorAll(s)');
  });

  it('包含每個分區的起始內容', () => {
    for (const file of LEGACY_FILES) {
      const head = readFileSync(resolve(LEGACY_DIR, file), 'utf8').split('\n')[0];
      expect(bundle, `${file} 的內容未出現在串接結果中`).toContain(head);
    }
  });

  it('串接後的體積等於各檔案體積總和（扣除每檔尾端換行）', () => {
    const sum = LEGACY_FILES.reduce((n, f) => {
      const body = readFileSync(resolve(LEGACY_DIR, f), 'utf8').replace(/\r?\n$/, '');
      return n + body.length;
    }, 0);
    // 27 個檔案以 '\n' 相接，多出 26 個分隔字元。
    expect(bundle.length).toBe(sum + LEGACY_FILES.length - 1);
  });
});

describe('index.html 只剩外殼', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

  it('包含 legacy bundle 的佔位註解', () => {
    expect(html).toContain('<!-- LEGACY_BUNDLE -->');
  });

  it('不再有 inline 的 <style> 或應用程式 <script>', () => {
    expect(html).not.toContain('<style>');
    // 只應剩下外部 CDN 的 script 標籤。
    const inlineScripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || [];
    expect(inlineScripts).toEqual([]);
  });

  it('外殼維持在可讀尺寸', () => {
    expect(html.split('\n').length).toBeLessThan(400);
  });
});
