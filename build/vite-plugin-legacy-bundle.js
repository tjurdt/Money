import { readLegacyBundle, legacyPaths, PLACEHOLDER } from './legacy-bundle.js';

/**
 * 把 src/legacy/ 串接後的內容注入 index.html 的佔位註解處。
 * dev 與 build 都走同一條路徑，兩者產出一致。
 */
export default function legacyBundlePlugin() {
  return {
    name: 'ledger-legacy-bundle',

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes(PLACEHOLDER)) {
          throw new Error(`index.html 內找不到 ${PLACEHOLDER} 佔位註解`);
        }
        // 必須用 replacer 函式，不能直接傳字串：replace() 會把替換字串裡的
        // $$、$&、$` 當成特殊樣式解讀，而 legacy 程式碼中就有
        // `const $$ = s => document.querySelectorAll(s)` —— 傳字串會讓它被
        // 改寫成 `const $ = ...`，造成重複宣告的 SyntaxError，整個 app 死掉。
        const bundle = `<script>\n${readLegacyBundle()}\n</script>`;
        return html.replace(PLACEHOLDER, () => bundle);
      },
    },

    // dev server：改動任一 legacy 檔案就整頁重載（單一作用域，無法熱替換）。
    configureServer(server) {
      for (const p of legacyPaths()) server.watcher.add(p);
      server.watcher.on('change', (file) => {
        if (legacyPaths().includes(file)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
