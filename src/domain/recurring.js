/**
 * 每月固定支出的日期推算。
 * 純函式：不碰 DOM、不讀全域狀態。
 */

/**
 * 算出某年月的發生日期（ISO 格式）。
 *
 * 指定日超過當月天數時落在該月最後一天 —— 例如設定每月 31 號，
 * 2 月會落在 28（閏年 29）、4 月落在 30。
 *
 * @param {number} y 西元年
 * @param {number} m 月份，0 起算（0 = 一月）
 * @param {number} day 指定日，超出 1～31 會被夾住
 * @returns {string} YYYY-MM-DD
 */
export function recurringOccurrenceDate(y, m, day) {
  const last = new Date(y, m + 1, 0).getDate();
  const d = Math.min(last, Math.max(1, +day || 1));
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
