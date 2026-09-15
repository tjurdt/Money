/**
 * 過渡期的 legacy bundle。
 *
 * 為什麼是「串接」而不是 ES Module import：
 * 目前有 35 個頂層可變全域（records、selCat、discountDraft …），
 * 全專案共約 145 處對它們重新賦值。ES Module 不允許對 import 進來的綁定賦值，
 * 因此真正的模組化必須等 P4 把狀態集中到 store 之後才能做。
 *
 * P1 的目標是「拆成可讀的檔案，且語意零變更」。串接後仍是單一 script 作用域，
 * 與拆分前完全等價 —— 這一點由 scripts/verify-legacy-bundle.js 自動驗證。
 *
 * 隨著 P3 把純函式抽成真正的 ES Module，這裡的檔案會逐步減少，
 * P4 完成後整個 src/legacy/ 與本檔一併移除。
 *
 * ⚠️ 順序即語意：manifest 的排列等同原本 index.html 內的出現順序，不可調換。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {string[]} 依載入順序排列的檔名。 */
export const LEGACY_FILES = JSON.parse(
  readFileSync(resolve(ROOT, 'build/legacy-manifest.json'), 'utf8')
);

export const LEGACY_DIR = resolve(ROOT, 'src/legacy');

/** 每個檔案的絕對路徑，供 dev server 監看變更。 */
export const legacyPaths = () => LEGACY_FILES.map(f => resolve(LEGACY_DIR, f));

/**
 * 串接成單一段 JS。
 *
 * 每個檔案在寫出時，尾端多加了一個換行（讓檔案符合「以換行結尾」的慣例）。
 * 這裡剝掉那一個換行後再以 '\n' 相接，即可還原成拆分前的原始內容。
 *
 * 用 /\r?\n$/ 而非 /\n$/：工作目錄的檔案是 CRLF，若只剝 \n 會留下孤立的 \r，
 * 使串接結果比原始內容多出一個換行。
 */
export function readLegacyBundle() {
  return LEGACY_FILES
    .map(f => readFileSync(resolve(LEGACY_DIR, f), 'utf8').replace(/\r?\n$/, ''))
    .join('\n');
}

/** index.html 內的佔位註解，legacy bundle 會取代它。 */
export const PLACEHOLDER = '<!-- LEGACY_BUNDLE -->';
