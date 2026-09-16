/* ===== 工具 ===== */
const $ = (s) => document.querySelector(s),
  $$ = (s) => document.querySelectorAll(s);
const sameMonth = (d) => ymKey(d) === ymKey(viewMonth);
const tripById = (id) => trips.find((t) => t.id === id);
const scopeLabel = (sc) => {
  if (sc && sc.type === 'all') return '🌐 全部';
  if (!sc || sc.type === 'daily') return '🏠 日常';
  const t = tripById(sc.trip);
  return scopeEntryLabel(t);
};
const tripDates = (t) =>
  t && (t.start || t.end) ? md(t.start) + (t.end ? '–' + md(t.end) : '') : '';
const lastRecDate = (id) => {
  let m = '';
  records.forEach((r) => {
    if (r.scope && r.scope.trip === id && r.date > m) m = r.date;
  });
  return m;
};
const sortedTrips = () => {
  const today = todayISO();
  const rank = (t) => {
    const start = t.start || '',
      end = t.end || t.start || '',
      fallback = lastRecDate(t.id) || '';
    if (start && start <= today && end && end >= today) return [0, '']; // 正在旅行
    if (start && start > today) return [1, start]; // 即將出發：越近越上
    const past = end || start || fallback;
    if (past) return [2, past]; // 已結束：最近的在上
    return [3, ''];
  };
  return [...trips].sort((a, b) => {
    const ra = rank(a),
      rb = rank(b);
    if (ra[0] !== rb[0]) return ra[0] - rb[0];
    if (ra[0] === 1) return ra[1].localeCompare(rb[1]);
    return rb[1].localeCompare(ra[1]);
  });
};
const CAT_COLORS = [
  '#0d6e60',
  '#3269c0',
  '#bb5c2c',
  '#6f56bd',
  '#3f9e6b',
  '#cf9a2b',
  '#bd5079',
  '#3f9aa2',
  '#7d8a56',
  '#98684a',
  '#5a76bf',
  '#a96b9c',
];
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
const palColor = (list, v) => {
  let i = list.indexOf(v);
  if (i < 0) i = Math.abs(hashStr(v));
  return CAT_COLORS[i % CAT_COLORS.length];
};
const catColor = (c) => catColors[c] || palColor([...catsExpense, ...catsIncome], c || '未分類');
const colorBg = (hex, a = 0.12) => {
  const h = String(hex || '#0d6e60').replace('#', '');
  const x =
    h.length === 3
      ? h
          .split('')
          .map((z) => z + z)
          .join('')
      : h;
  const n = parseInt(x, 16);
  if (!Number.isFinite(n)) return 'rgba(13,110,96,.12)';
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2200);
}
const isTripScope = () => isScopedToEntry(currentScope);
const inCurrentScope = (r) =>
  currentScope.type === 'all'
    ? true
    : currentScope.type === 'daily'
      ? r.scope && r.scope.type === 'daily'
      : r.scope && r.scope.trip === currentScope.trip;
function inListPeriod(date) {
  if (isTripScope()) return true;
  if (listPeriod.mode === 'all') return true;
  if (listPeriod.mode === 'day') return date === listPeriod.from;
  if (listPeriod.mode === 'custom') {
    const f = listPeriod.from || '',
      t = listPeriod.to || '';
    return (!f || date >= f) && (!t || date <= t);
  }
  return sameMonth(date);
}
const viewRecords = () =>
  records.filter((r) => r.kind !== 'investment' && inCurrentScope(r) && inListPeriod(r.date));
const globalSearchRecords = () => records.filter((r) => r.kind !== 'investment');

/* 我的實際花費（分帳後） */
function paidOutOf(r) {
  if (r.kind !== 'expense') return 0;
  if (r.split && r.split.payer === 'other') return 0;
  return +r.total || 0;
}
function recordCategories(r) {
  if (r.kind !== 'expense' && r.kind !== 'income') return [];
  if (r.kind === 'expense' && r.catMode === 'perItem')
    return [...new Set((r.items || []).map((i) => i.category).filter(Boolean))];
  return r.category ? [r.category] : [];
}
/* 支出分類貢獻（含子分類、分帳比例） */
