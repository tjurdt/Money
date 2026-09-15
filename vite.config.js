import { defineConfig } from 'vite';
import legacyBundle from './build/vite-plugin-legacy-bundle.js';

/**
 * 專案部署在 GitHub Pages 的 /Money/ 子路徑底下。
 * public/ 內的檔案（icons、manifest、service worker）會原樣複製到 dist/ 根目錄，
 * 因此 index.html 與 SW 裡的相對路徑 './xxx' 依然成立。
 */
export default defineConfig({
  base: '/Money/',
  plugins: [legacyBundle()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 目前整個 app 仍是單一 inline <script>，先不切 chunk；
    // P1 拆模組後再視情況調整。
    assetsInlineLimit: 0,
    // 重構期間關閉 CSS 壓縮。
    //
    // 壓縮器會合併相鄰規則、重排宣告、簡寫數值（flex:1 1 auto → flex:auto）。
    // 這些變換本身是等價的，但無法逐條驗證；而這個專案的 CSS 有 4 層版本覆寫
    // （.appbar 宣告 4 次、:root 2 次），cascade 順序是行為的一部分。
    // 關閉壓縮後建置產物即為忠實串接，可與原始碼做精確比對。
    // 代價約 4KB gzip；待 P6 建立視覺回歸測試後再開啟。
    cssMinify: false,
  },
  server: { port: 5173, open: true },
});
