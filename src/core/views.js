/**
 * 畫面註冊表：把渲染從「中央列舉」改成「各自訂閱」。
 *
 * 原本的寫法
 *   function renderAll() {
 *     renderScopePill(); renderMonthBar(); renderSummary();
 *     renderFilterChips(); renderList(); renderFirstRunBanner();
 *     if (圖表頁是開的) renderCharts();
 *   }
 * 再加上 22 處手動呼叫 renderAll()，以及分頁切換處的
 *   if (view === 'chart') renderCharts();
 *
 * 兩個後果：
 *   1. 新增一個畫面，得回頭改 renderAll()、改分頁切換 —— 漏改就是畫面不同步。
 *   2. 改了資料卻忘記呼叫 renderAll()，畫面就停在舊資料上。
 *
 * 改成註冊制之後
 *   畫面自己宣告「我依賴哪些狀態」，store 一變動就自動重繪。
 *   新增畫面只要在它自己的檔案裡 registerView(...)，不必動任何既有程式碼。
 */
import { subscribe } from './store.js';

/**
 * @typedef {object} ViewSpec
 * @property {string} id 識別碼，通常對應 DOM 上的 #view-<id>
 * @property {() => void} render 重繪函式
 * @property {string[]} deps 依賴的 store 狀態鍵；其中任一變動就重繪
 * @property {() => boolean} [isActive] 目前是否需要重繪，預設為「所屬區塊是 active」
 */

/** @type {Map<string, ViewSpec>} */
const views = new Map();

/** 等待重繪的狀態鍵，於微任務中一次處理完。 */
let pendingKeys = null;

/** 重繪進行中。用來擋掉「重繪過程改到狀態」造成的無限迴圈。 */
let rendering = false;

/**
 * 預設的啟用判斷：DOM 上對應的區塊帶有 active 類別。
 * 找不到該區塊時視為啟用（例如 appbar 這類常駐元素）。
 */
function defaultIsActive(id) {
  try {
    const el = typeof document !== 'undefined' && document?.querySelector(`#view-${id}`);
    return el ? el.classList.contains('active') : true;
  } catch {
    // 頁面正在卸載時 document 可能已失效。
    return false;
  }
}

/**
 * 註冊一個畫面。
 *
 * 同一個 id 重複註冊會覆蓋前一次 —— 方便開發時熱重載，
 * 也避免同一個畫面被重繪兩次。
 *
 * @param {ViewSpec} spec
 * @returns {() => void} 取消註冊
 */
export function registerView(spec) {
  if (!spec || typeof spec.id !== 'string' || typeof spec.render !== 'function') {
    throw new Error('registerView 需要 { id, render, deps }');
  }
  views.set(spec.id, {
    deps: [],
    isActive: () => defaultIsActive(spec.id),
    ...spec,
  });
  return () => views.delete(spec.id);
}

/** 已註冊的畫面 id。 */
export function registeredViewIds() {
  return [...views.keys()];
}

/**
 * 重繪單一畫面，不論它是否啟用。
 * 單一畫面拋錯不會影響其他畫面。
 */
export function renderView(id) {
  const view = views.get(id);
  if (!view) return false;
  try {
    view.render();
  } catch (e) {
    console.error(`[views] 重繪 ${id} 時拋出例外`, e);
  }
  return true;
}

/**
 * 重繪所有啟用中的畫面。
 * 取代原本手動列舉的 renderAll()。
 */
export function renderAllViews() {
  runRender(() => {
    for (const [id, view] of views) {
      if (view.isActive()) renderView(id);
    }
  });
}

/**
 * 重繪依賴了這些狀態鍵、且目前啟用中的畫面。
 * @param {Iterable<string>} keys
 */
export function renderViewsFor(keys) {
  const changed = new Set(keys);
  runRender(() => {
    for (const [id, view] of views) {
      if (!view.isActive()) continue;
      if (view.deps.some((d) => changed.has(d))) renderView(id);
    }
  });
}

/**
 * 把某個畫面切為前景並立即重繪。
 * 分頁切換時呼叫，取代原本 `if (view === 'chart') renderCharts();` 的列舉。
 */
export function activateView(id) {
  return renderView(id);
}

/** 包住一次重繪，擋掉重繪過程中再次觸發的重繪。 */
function runRender(fn) {
  if (rendering) return;
  rendering = true;
  try {
    fn();
  } finally {
    rendering = false;
  }
}

/**
 * 接上 store：狀態變動時自動重繪相關畫面。
 *
 * 變動會在微任務中合併處理 —— 一次操作若連續改了 records、settings、trips，
 * 只會觸發一輪重繪，而不是三輪。
 *
 * @returns {() => void} 取消訂閱
 */
export function connectStore() {
  return subscribe((key) => {
    // 重繪過程中的狀態變動不再觸發新一輪重繪，避免互相牽動。
    if (rendering) return;
    if (pendingKeys) {
      pendingKeys.add(key);
      return;
    }
    pendingKeys = new Set([key]);
    queueMicrotask(() => {
      const keys = pendingKeys;
      pendingKeys = null;
      // 排程與執行之間頁面可能已經關閉（分頁卸載、測試環境拆掉 jsdom），
      // 此時連判斷「畫面是否啟用」都會拋錯。這裡兜住，避免變成未捕捉例外。
      try {
        renderViewsFor(keys);
      } catch (e) {
        console.error('[views] 批次重繪失敗', e);
      }
    });
  });
}

/** 測試用：清空註冊表。 */
export function __clearViews() {
  views.clear();
  pendingKeys = null;
  rendering = false;
}
