/* ===== 狀態 ===== */
// records / catsExpense / catsIncome / payments / subcats / prices / twseCache /
// catColors / trips / currentScope / settings 由 src/core/store.js 管理，
// 並透過 store.installGlobals() 以存取器的形式提供給此處的 legacy 程式碼。
// 下方的種子資料與正規化邏輯透過那些存取器讀寫，寫入會經過 store。
const _seeded = (() => {
  try {
    return localStorage.getItem('ledger.v23.seeded');
  } catch (e) {
    return null;
  }
})();
if (!_seeded && !records.length && !catsExpense.length && !catsIncome.length && !payments.length) {
  catsExpense = ['餐食', '交通', '日用品', '娛樂', '居家', '醫療', '其他'];
  catsIncome = ['薪資', '其他收入'];
  payments = ['信用卡', '現金', '行動支付', '轉帳'];
  subcats = {
    ...subcats,
    餐食: ['早餐', '午餐', '晚餐', '點心／飲料'],
    交通: ['大眾運輸', '計程車／叫車', '加油'],
  };
  const dc = ['#0d6e60', '#3269c0', '#bb5c2c', '#6f56bd', '#3f9e6b', '#cf9a2b', '#bd5079'];
  catsExpense.forEach((c, i) => {
    if (!catColors[c]) catColors[c] = dc[i % dc.length];
  });
  catColors['薪資'] = catColors['薪資'] || '#2c9968';
  catColors['其他收入'] = catColors['其他收入'] || '#3f9e6b';
  save(K.ce, catsExpense);
  save(K.ci, catsIncome);
  save(K.pay, payments);
  save(K.sub, subcats);
  save(K.cc, catColors);
}
try {
  localStorage.setItem('ledger.v23.seeded', '1');
} catch (e) {}
let viewMonth = new Date(),
  activeFilter = 'all',
  barDim = 'month',
  chartRange = 'month',
  pieMode = 'category';
let listQuery = '',
  listCatFilter = '',
  listPayFilter = '',
  itemDetailOpen = false,
  customFrom = '',
  customTo = '';
let listPeriod = load('ledger.list.period.v1', { mode: 'month', from: '', to: '' });
if (!listPeriod || !['month', 'day', 'all', 'custom'].includes(listPeriod.mode))
  listPeriod = { mode: 'month', from: '', to: '' };
if (listPeriod.mode === 'month' && /^\d{4}-\d{2}/.test(listPeriod.from || '')) {
  const [y, m] = (listPeriod.from || '').split('-').map(Number);
  if (y && m) viewMonth = new Date(y, m - 1, 1);
}
let selectedScopes = new Set();
let editingId = null,
  formScope = null,
  selCat = null,
  selSub = null,
  selPay = null,
  catMode = 'whole',
  invAct = 'buy',
  storeMode = 'single';
let discountDraft = [],
  discountBaseAmount = 0,
  discountOverrideTotal = null,
  discountEditingRuleId = null,
  discountEditorType = 'order_percent',
  discountEditorMode = 'stack';
let charts = { pie: null, bar: null, trip: null },
  gmapsReady = false,
  storeAC = null,
  googleLoadPromise = null;

// lending → split 正規化已移至 src/core/migrations.js。
