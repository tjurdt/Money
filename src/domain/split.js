/**
 * 分帳運算。
 *
 * 純函式：只吃帳目物件、吐數值，不碰 DOM、不讀全域狀態。
 *
 * 分帳資料格式（record.split，null 代表沒有分帳）：
 *   partner  對象名稱
 *   payer    'me' | 'other' —— 誰先付了這筆錢
 *   myShare  我實際應負擔的金額
 *   preset   'even' | 'mine' | 'theirs' | 'own' —— UI 用的預設模式
 *   settled  是否已結清（由呼叫端決定要不要過濾）
 */

/**
 * 我實際負擔的金額。
 * myShare 會被夾在 0 與總額之間，避免髒資料算出負數或超額。
 * @param {object} r 帳目
 * @returns {number}
 */
export function myShareOf(r) {
  if (r.kind !== 'expense') return 0;
  if (r.split) return Math.max(0, Math.min(r.split.myShare, r.total));
  return r.total;
}

/**
 * 這筆帳造成的債務餘額。
 * 正值＝對方欠我，負值＝我欠對方，0＝互不相欠。
 * @param {object} r 帳目
 * @returns {number}
 */
export function splitBalance(r) {
  if (!r.split) return 0;
  // 加 0 是為了把 -0 正規化成 0：myShare 為 0 時 -myShareOf(r) 會得到 -0，
  // 數值上相等但 Object.is 與快照比對會出現差異。
  return (r.split.payer === 'me' ? r.total - myShareOf(r) : -myShareOf(r)) + 0;
}

/**
 * 我負擔的比例（0～1），用於把金額按比例攤到各品項。
 * @param {object} r 帳目
 * @returns {number}
 */
export function splitRatio(r) {
  if (r.kind !== 'expense') return 0;
  if (!r.split) return 1;
  return r.total > 0 ? myShareOf(r) / r.total : 0;
}

/**
 * 把舊版的分帳預設名稱對應到現行名稱。
 * @param {string} p
 * @returns {string}
 */
export function normalizedSplitPreset(p) {
  return p === 'all' ? 'mine' : p === 'none' ? 'theirs' : p === 'custom' ? 'own' : p || 'even';
}
