/**
 * 統計聚合。
 *
 * 圓餅圖、長條圖、分類統計共同的底層：把一筆帳目攤成「分類 → 金額」的貢獻清單。
 * 純函式：不碰 DOM、不讀全域狀態。
 */
import { splitRatio } from './split.js';

/**
 * 一筆支出對各分類的貢獻。分帳比例會乘進每一項，因此回傳的金額是「我負擔的部分」。
 *
 * - `catMode === 'perItem'` 時每個品項各自帶分類；否則整筆共用 record 的分類。
 * - 我完全不負擔（例如對方請客）時回傳空陣列。
 *
 * @param {object} r 帳目
 * @returns {Array<{category: string, sub: string, amount: number}>}
 */
export function expenseContribs(r) {
  if (r.kind !== 'expense') return [];
  const ratio = splitRatio(r);
  if (ratio <= 0) return [];
  if (r.items && r.items.length)
    return r.items.map((it) => ({
      category: r.catMode === 'perItem' ? it.category || '未分類' : r.category || '未分類',
      sub: r.catMode === 'perItem' ? it.sub || '' : r.sub || '',
      amount: (+it.price || 0) * ratio,
    }));
  return [{ category: r.category || '未分類', sub: r.sub || '', amount: r.total * ratio }];
}
