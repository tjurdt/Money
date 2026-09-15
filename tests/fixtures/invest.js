/** 投資交易樣本：買進 → 加碼 → 賣出 → 配息，用來驗證移動平均成本法。 */
const base = {
  kind: 'investment',
  scope: { type: 'daily', trip: null },
  payment: '轉帳',
  hashtags: [],
  note: '',
  items: [],
  category: null,
  sub: null,
  catMode: 'whole',
  split: null,
};

export const buy1 = {
  ...base,
  id: 'i1',
  createdAt: 1,
  date: '2026-01-10',
  store: '台積電',
  total: 100040,
  inv: { action: 'buy', symbol: '台積電', ticker: '2330', shares: 1000, unitPrice: 100, fee: 40 },
};

export const buy2 = {
  ...base,
  id: 'i2',
  createdAt: 2,
  date: '2026-02-10',
  store: '台積電',
  total: 120050,
  inv: { action: 'buy', symbol: '台積電', ticker: '2330', shares: 1000, unitPrice: 120, fee: 50 },
};

export const sell1 = {
  ...base,
  id: 'i3',
  createdAt: 3,
  date: '2026-03-10',
  store: '台積電',
  total: 59940,
  inv: { action: 'sell', symbol: '台積電', ticker: '2330', shares: 500, unitPrice: 130, fee: 60 },
};

export const dividend1 = {
  ...base,
  id: 'i4',
  createdAt: 4,
  date: '2026-04-10',
  store: '台積電',
  total: 3000,
  inv: { action: 'dividend', symbol: '台積電', ticker: '2330', shares: 0, unitPrice: 0, fee: 0 },
};

export const investRecords = [buy1, buy2, sell1, dividend1];
