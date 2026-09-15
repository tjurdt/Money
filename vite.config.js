import { defineConfig } from 'vite';

/**
 * 專案部署在 GitHub Pages 的 /Money/ 子路徑底下。
 * public/ 內的檔案（icons、manifest、service worker）會原樣複製到 dist/ 根目錄，
 * 因此 index.html 與 SW 裡的相對路徑 './xxx' 依然成立。
 */
export default defineConfig({
  base: '/Money/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 目前整個 app 仍是單一 inline <script>，先不切 chunk；
    // P1 拆模組後再視情況調整。
    assetsInlineLimit: 0,
  },
  server: { port: 5173, open: true },
});
