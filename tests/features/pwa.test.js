/**
 * PWA 設定的守衛。
 *
 * manifest 與圖示的問題不會讓測試變紅、也不會在瀏覽器主控台報錯 ——
 * 只會在使用者把 app 加到主畫面時，看到一個被裁掉的醜圖示。
 * 這種錯誤沒有自動檢查就只能靠肉眼發現。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bootLegacyApi } from '../harness.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'public/ledger-manifest.webmanifest'), 'utf8'),
);
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

describe('manifest 基本欄位', () => {
  it('以獨立視窗模式執行 —— 這是「沒有網址列」的關鍵', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('scope 與 start_url 為相對路徑，才能在 /Money/ 子路徑下運作', () => {
    expect(manifest.scope).toBe('./');
    expect(manifest.start_url).toBe('./');
  });

  it('有穩定的 id，換版不會被當成另一個 app', () => {
    expect(manifest.id).toBeTruthy();
  });

  it('標示語言，避免系統以錯誤語系顯示名稱', () => {
    expect(manifest.lang).toBe('zh-Hant');
  });
});

describe('圖示用途分離', () => {
  const purposes = (p) => manifest.icons.filter((i) => i.purpose === p);

  it('any 與 maskable 各自有專屬圖檔', () => {
    // 曾經兩者共用同一張貼邊的圖：Android 會把 maskable 裁成圓形，
    // 角落內容被切掉，看起來像沒設計過。
    expect(purposes('any').length).toBeGreaterThan(0);
    expect(purposes('maskable').length).toBeGreaterThan(0);
  });

  it('沒有任何圖示同時宣告 any 與 maskable', () => {
    const both = manifest.icons.filter((i) => i.purpose?.includes(' '));
    expect(both, '同一張圖不可能同時適合兩種用途').toEqual([]);
  });

  it('any 與 maskable 指向不同的檔案', () => {
    const anySrc = new Set(purposes('any').map((i) => i.src));
    const maskSrc = new Set(purposes('maskable').map((i) => i.src));
    for (const src of maskSrc) expect(anySrc.has(src)).toBe(false);
  });

  it('提供 192 與 512 兩種尺寸', () => {
    const sizes = new Set(manifest.icons.map((i) => i.sizes));
    expect(sizes.has('192x192')).toBe(true);
    expect(sizes.has('512x512')).toBe(true);
  });

  it('manifest 列出的圖檔都存在', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(ROOT, 'public', icon.src)), `缺少 ${icon.src}`).toBe(true);
    }
  });
});

describe('index.html 的行動裝置設定', () => {
  it('viewport 使用 viewport-fit=cover，讓版面延伸到瀏海區', () => {
    expect(html).toMatch(/viewport-fit=cover/);
  });

  it('連結 manifest', () => {
    expect(html).toMatch(/<link rel="manifest" href="ledger-manifest\.webmanifest"/);
  });

  it('提供 apple-touch-icon —— iOS 不讀 manifest 的圖示', () => {
    expect(html).toMatch(/rel="apple-touch-icon"/);
    expect(existsSync(resolve(ROOT, 'public/ledger-icon-180.png'))).toBe(true);
  });

  it('設定 iOS 主畫面名稱', () => {
    expect(html).toMatch(/name="apple-mobile-web-app-title"/);
  });

  it('宣告可獨立執行', () => {
    expect(html).toMatch(/name="mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/name="apple-mobile-web-app-capable" content="yes"/);
  });
});

describe('加入主畫面的引導', () => {
  it('未安裝時顯示步驟說明', () => {
    const { api, close } = bootLegacyApi({ storage: { 'ledger.v23.seeded': '1' } });
    api.eval('renderSettings();');
    const card = api.document.querySelector('#installCard');
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain('加入主畫面');
    close();
  });

  it('已是獨立視窗時改成低調的確認訊息', () => {
    const { api, close } = bootLegacyApi({ storage: { 'ledger.v23.seeded': '1' } });
    // 模擬已加入主畫面的執行環境。
    api.eval('window.matchMedia = () => ({ matches: true, addEventListener() {} });');
    api.eval('renderInstallCard();');
    const card = api.document.querySelector('#installCard');
    expect(card.className).toContain('ok');
    expect(card.textContent).toContain('應用程式模式');
    close();
  });
});
