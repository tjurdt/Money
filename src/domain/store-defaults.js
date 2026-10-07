/**
 * 店家預設值：輸入店名後，帶入該店「上一筆」消費的分類與付款方式。
 *
 * 取「上一筆」而不是「出現最多次」：使用者要的是「跟上次一樣」，
 * 而且最近一次的選擇通常最能反映現在的習慣（換了常用信用卡就該跟著換）。
 *
 * 純函式：不碰 DOM、不讀全域狀態。
 */

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

/** 最近的排在前面：先比日期，同一天再比建立時間。 */
const newestFirst = (a, b) =>
  String(b.date || '').localeCompare(String(a.date || '')) ||
  (+b.createdAt || 0) - (+a.createdAt || 0);

/** 一筆支出代表性的分類與子分類。逐項分類的帳目取第一個有分類的品項。 */
function categoryOf(r) {
  if (r.catMode === 'perItem') {
    const it = (r.items || []).find((i) => i && i.category);
    return it ? { category: it.category, sub: it.sub || null } : null;
  }
  return r.category ? { category: r.category, sub: r.sub || null } : null;
}

/**
 * @param {object[]} records 全部帳目
 * @param {string} store 店名（完整比對，不分大小寫、忽略前後空白）
 * @param {{excludeId?: string}} [opts] 編輯中的帳目要排除，避免拿自己當「上一筆」
 * @returns {{category: string|null, sub: string|null, payment: string|null}|null}
 *   沒有這家店的歷史時回傳 null
 */
export function lastStoreDefaults(records, store, opts = {}) {
  const key = norm(store);
  if (!key) return null;
  const hist = records
    .filter((r) => r.kind === 'expense' && norm(r.store) === key && r.id !== opts.excludeId)
    .sort(newestFirst);
  if (!hist.length) return null;
  const cat = hist.map(categoryOf).find(Boolean) || null;
  const pay = hist.find((r) => r.payment);
  return {
    category: cat ? cat.category : null,
    // 子分類只有跟分類來自同一筆時才有意義，這裡的 categoryOf 已經保證成對。
    sub: cat ? cat.sub : null,
    payment: pay ? pay.payment : null,
  };
}
