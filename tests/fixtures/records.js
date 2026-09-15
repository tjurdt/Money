/**
 * 代表性帳目樣本 —— 涵蓋重構最容易改壞的幾條路徑。
 * 這是人工構造的資料，不含任何真實個資。
 */

/** 單純支出，無分帳、無折扣。 */
export const plainExpense = {
  id: 'r-plain', createdAt: 1700000000000, date: '2026-03-05', kind: 'expense',
  scope: { type: 'daily', trip: null }, store: '全家', payment: '信用卡',
  hashtags: [], note: '', items: [{ name: '咖啡', price: 55, category: null, sub: null }],
  category: '餐食', sub: '點心／飲料', catMode: 'whole', total: 55,
  split: null, inv: null,
};

/** 我先付、對方欠我一半 —— 分帳最常見的情況。 */
export const splitEven = {
  ...plainExpense, id: 'r-split-even', store: '火鍋店', total: 1200,
  category: '餐食', sub: '晚餐',
  items: [{ name: '兩人套餐', price: 1200, category: null, sub: null }],
  split: { partner: '小明', payer: 'me', myShare: 600, preset: 'even', settled: false },
};

/** 對方先付、我欠對方 —— 餘額方向必須相反。 */
export const splitOtherPaid = {
  ...plainExpense, id: 'r-split-other', store: '電影院', total: 700,
  category: '娛樂', sub: null,
  items: [{ name: '電影票', price: 700, category: null, sub: null }],
  split: { partner: '小明', payer: 'other', myShare: 350, preset: 'even', settled: false },
};

/** 我請客：我付全額，自己也負擔全額，對方不欠我。 */
export const splitTreat = {
  ...plainExpense, id: 'r-split-treat', store: '咖啡廳', total: 400,
  category: '餐食', sub: null,
  items: [{ name: '下午茶', price: 400, category: null, sub: null }],
  split: { partner: '小明', payer: 'me', myShare: 400, preset: 'mine', settled: false },
};

/** 對方請客：對方付全額，我不負擔 —— myShare 為 0。 */
export const splitTreated = {
  ...plainExpense, id: 'r-split-treated', store: '日本料理', total: 900,
  category: '餐食', sub: null,
  items: [{ name: '晚餐', price: 900, category: null, sub: null }],
  split: { partner: '小明', payer: 'other', myShare: 0, preset: 'theirs', settled: false },
};

/** 逐項分類 —— 統計聚合最容易出錯的路徑。 */
export const perItemCategories = {
  ...plainExpense, id: 'r-peritem', store: '家樂福', total: 500, catMode: 'perItem',
  category: null, sub: null,
  items: [
    { name: '牛奶', price: 100, category: '餐食', sub: '早餐' },
    { name: '洗衣精', price: 300, category: '日用品', sub: null },
    { name: '原子筆', price: 100, category: '日用品', sub: null },
  ],
};

/** 逐項分類 ＋ 分帳 —— 兩個機制交叉，分帳比例要套進每個品項。 */
export const perItemSplit = {
  ...perItemCategories, id: 'r-peritem-split',
  split: { partner: '小明', payer: 'me', myShare: 200, preset: 'own', settled: false },
};

/** 收入。 */
export const income = {
  id: 'r-income', createdAt: 1700000000000, date: '2026-03-01', kind: 'income',
  scope: { type: 'daily', trip: null }, store: '公司', payment: '轉帳',
  hashtags: [], note: '', items: [], category: '薪資', sub: null,
  catMode: 'whole', total: 50000, split: null, inv: null,
};

/** 已結清的分帳 —— 不應再計入未結餘額。 */
export const splitSettled = {
  ...splitEven, id: 'r-split-settled',
  split: { ...splitEven.split, settled: true },
};

/** 旅遊情境的支出 —— 情境篩選用。 */
export const tripExpense = {
  ...plainExpense, id: 'r-trip', date: '2026-04-10', store: '飯店',
  scope: { type: 'trip', trip: 't-japan' }, total: 8000,
  category: '居家', sub: null,
  items: [{ name: '住宿', price: 8000, category: null, sub: null }],
};

export const allRecords = [
  plainExpense, splitEven, splitOtherPaid, splitTreat, splitTreated,
  perItemCategories, perItemSplit, income, splitSettled, tripExpense,
];
