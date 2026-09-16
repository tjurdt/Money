/**
 * 日期工具。純函式，無副作用。
 * 一律以使用者本地時區為準，不做 UTC 換算。
 */

/** 今天的 ISO 日期（YYYY-MM-DD），以本地時區計算。 */
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};

/** 年月鍵值（YYYY-MM），用於月份分組與比對。 */
export const ymKey = (d) => {
  const t = new Date(d);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
};

/** 簡短的月／日顯示（例如 3/5）；空值回傳空字串。 */
export const md = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return t.getMonth() + 1 + '/' + t.getDate();
};
