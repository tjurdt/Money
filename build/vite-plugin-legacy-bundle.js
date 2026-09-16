import { readAppBundle, legacyPaths, DOMAIN_ENTRY, PLACEHOLDER } from './legacy-bundle.js';

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
        const bundle = `<script>\n${readAppBundle()}\n</script>`;
        return html.replace(PLACEHOLDER, () => bundle);
      },
    },

    // dev server：改動 legacy 或 domain 檔案就整頁重載
    // （legacy 是單一作用域，無法熱替換）。
    configureServer(server) {
      const watched = () => [...legacyPaths(), DOMAIN_ENTRY];
      for (const p of watched()) server.watcher.add(p);
      server.watcher.on('change', (file) => {
        // Windows 的路徑分隔符正規化成 '/' 再比對。
        const inDomain = file.split('\\').join('/').includes('/src/');
        if (inDomain || legacyPaths().includes(file)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
