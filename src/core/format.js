/**
 * 金額與文字格式化。純函式，無副作用。
 */

/** 產生一個短的唯一識別碼（時間戳 + 隨機字尾）。 */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * 金額格式化：加錢號與千分位，四捨五入到整數。
 * 注意負數輸出為 "$-99"（錢號在負號前），這是沿用既有顯示樣式。
 */
export const nf = (n) => '$' + Math.round(n).toLocaleString('en-US');

/**
 * HTML 轉義。只處理 & < > 與雙引號 ——
 * 單引號不轉義，因此屬性值務必用雙引號包起來。
 */
export const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
