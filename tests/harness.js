/**
 * Legacy harness — P0 安全網的核心。
 *
 * 目前所有邏輯都在 index.html 的單一 inline <script> 裡，且全部是頂層全域。
 * 這個 harness 把「全域污染」轉成測試上的優勢：把真實的 index.html 載進 jsdom，
 * 讓腳本照常執行，接著就能從 window 上直接取到那 268 個函式來做特徵化測試。
 *
 * 重構期間這個檔案不該改動 —— 它是判斷「行為有沒有被改壞」的基準線。
 * P1~P4 完成、邏輯都搬進 src/domain/ 之後，本檔連同 legacy 測試才會退場。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { readLegacyBundle, PLACEHOLDER } from '../build/legacy-bundle.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 外部 CDN 在測試環境一律不載入，改用下面的 stub。 */
const STRIP_EXTERNAL_SCRIPTS = /<script\b[^>]*\bsrc=["']https?:\/\/[^"']*["'][^>]*>\s*<\/script>/gi;

/** 在 legacy 腳本執行前先塞好它預期存在的第三方全域。 */
const STUBS = `<script>
  window.__stubCalls = [];
  const rec = (name, args) => { window.__stubCalls.push({ name, args }); };

  class ChartStub {
    constructor(ctx, cfg) { this.ctx = ctx; this.config = cfg; this.data = cfg && cfg.data; rec('Chart.new', [cfg && cfg.type]); }
    destroy() { rec('Chart.destroy', []); }
    update() { rec('Chart.update', []); }
    resize() {}
  }
  ChartStub.register = () => {};
  ChartStub.defaults = { font: {}, plugins: { legend: {} } };
  window.Chart = ChartStub;

  window.Tesseract = {
    createWorker: async () => ({
      recognize: async () => ({ data: { text: '', words: [] } }),
      terminate: async () => {},
      setParameters: async () => {},
    }),
  };

  window.Papa = {
    parse: (input, cfg) => { const out = { data: [], errors: [], meta: {} }; if (cfg && cfg.complete) cfg.complete(out); return out; },
    unparse: () => '',
  };

  window.google = {
    accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }), revoke() {} }, id: { initialize() {}, prompt() {} } },
    maps: null,
  };

  // 測試不得打外部網路。
  window.fetch = async (url) => { rec('fetch', [String(url)]); throw new Error('network disabled in tests'); };

  // jsdom 沒有 canvas；Chart 已被 stub，這裡只擋住直接取 context 的地方。
  if (window.HTMLCanvasElement) {
    window.HTMLCanvasElement.prototype.getContext = function () {
      return { canvas: this, measureText: () => ({ width: 0 }), fillRect(){}, clearRect(){}, save(){}, restore(){}, beginPath(){}, arc(){}, fill(){}, stroke(){} };
    };
  }
</script>`;

/**
 * 啟動一份乾淨的 legacy app。
 * @param {object} [opts]
 * @param {Record<string,unknown>} [opts.storage] 預先寫入 localStorage 的內容（值會被 JSON 序列化）。
 * @param {string} [opts.url] 頁面網址，影響 location.origin 相關邏輯。
 * @param {string} [opts.entry] 要載入的 HTML，相對於專案根目錄。
 *   預設是原始碼 index.html；傳 'dist/index.html' 可對建置產物跑同一套測試，
 *   用來確認打包流程沒有改變行為。
 * @returns {{window: object, errors: Error[], close: () => void}}
 */
export function bootLegacyApp({
  storage = {},
  url = 'https://tjurdt.github.io/Money/',
  entry = 'index.html',
} = {}) {
  const raw = readFileSync(resolve(ROOT, entry), 'utf8');

  // 原始碼的 index.html 只留下佔位註解，app 邏輯放在 src/legacy/ 各檔。
  // 這裡用與 Vite plugin 相同的串接函式注入，確保測試與實際產出一致。
  // dist/ 的 index.html 已由建置注入完畢，不含佔位註解，此步驟自動跳過。
  // 用 replacer 函式而非字串：替換字串中的 $$、$& 等會被當成特殊樣式解讀，
  // 而 legacy 程式碼裡就有 `const $$ = s => document.querySelectorAll(s)`。
  const withBundle = raw.includes(PLACEHOLDER)
    ? raw.replace(
        PLACEHOLDER,
        () => `<script>
${readLegacyBundle()}
</script>`,
      )
    : raw;

  const html = withBundle.replace(STRIP_EXTERNAL_SCRIPTS, '').replace('</head>', `${STUBS}</head>`);

  const errors = [];
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // 種子資料必須在 inline 腳本讀取前就位。
      for (const [k, v] of Object.entries(storage)) {
        window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
      window.addEventListener('error', (e) => errors.push(e.error ?? new Error(e.message)));
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => null;
      window.scrollTo = () => {};
      window.matchMedia =
        window.matchMedia ||
        (() => ({
          matches: false,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
        }));
    },
  });

  return { window: dom.window, errors, close: () => dom.window.close() };
}

/**
 * 大多數測試只需要全域函式，不關心 DOM。
 *
 * 注意：legacy 腳本裡的 `function f(){}` 會掛上 window，但頂層的 `const`/`let`
 * （nf、esc、ymKey、$ …）不會。後者要透過 `evalInApp` 在該 window 的作用域內求值。
 */
export function bootLegacyApi(opts) {
  const { window, errors, close } = bootLegacyApp(opts);
  /** 在 app 的全域作用域裡求值，可取得頂層 const/let。 */
  const evalInApp = (expr) => window.eval(expr);
  /** 取出一個頂層綁定（不論它是 function 還是 const）。 */
  const grab = (name) => window.eval(name);
  return { api: window, evalInApp, grab, errors, close };
}
