/**
 * domain 與 core 層的匯出進入點。
 *
 * 這裡的每個模組都是純函式：只吃參數、吐回傳值，不碰 DOM、不讀寫 localStorage、
 * 不依賴任何全域可變狀態。因此可以直接 import 進測試，不需要啟動 jsdom。
 *
 * 過渡期做法：build/legacy-bundle.js 會把本檔打包成 IIFE，
 * 在 legacy script 之前執行並把所有匯出掛上 globalThis，
 * 讓仍在 src/legacy/ 的程式碼可以照原樣呼叫這些函式。
 * P4 完成後 legacy 消失，屆時改為一般的 import。
 */
export * from '../core/format.js';
export * from '../core/date.js';
export * from './split.js';
export * from './stats.js';
export * from './discount.js';
export * from './invest.js';
export * from './recurring.js';
