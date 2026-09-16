/**
 * domain 與 core 層的匯出進入點。
 *
 * domain/ 與 core/ 的模組都是真正的 ES Module。純計算部分（split、stats、
 * discount、invest、recurring、format、date）不碰 DOM、不讀全域狀態，
 * 可以直接 import 進測試，不需要啟動 jsdom。
 * storage 與 store 有副作用，但同樣是真模組。
 *
 * 過渡期做法：build/legacy-bundle.js 會把本檔打包成 IIFE，
 * 在 legacy script 之前執行並把所有匯出掛上 globalThis，
 * 讓仍在 src/legacy/ 的程式碼可以照原樣呼叫這些函式。
 * P4b 完成後 legacy 消失，屆時改為一般的 import。
 */
export * from '../core/format.js';
export * from '../core/date.js';
export * from '../core/storage.js';
export * from './split.js';
export * from './stats.js';
export * from './discount.js';
export * from './invest.js';
export * from './recurring.js';

import * as store from '../core/store.js';

/**
 * store 以命名空間匯出，避免 get / set / subscribe 這類通用名稱污染全域。
 * legacy 透過 installGlobals() 安裝的存取器存取狀態，不直接用這個物件。
 */
export { store };

// 安裝全域狀態存取器，讓 src/legacy/ 既有的 `records = x` 等寫法接上 store。
// 必須在 legacy script 執行前完成 —— 本檔打包出的 IIFE 正是排在它之前。
store.installGlobals();
