/**
 * 常用外幣目錄。
 *
 * 出國旅行的情境可從這裡挑選要使用的貨幣。
 * decimals 是該貨幣實務上的小數位數（日圓、韓元、越南盾沒有小數），
 * 輸入欄位與顯示都依此決定，避免出現「¥3,000.00」這種不自然的寫法。
 *
 * 純資料：不碰 DOM、不讀全域狀態。
 */

/** @typedef {{code: string, name: string, symbol: string, decimals: number, flag: string}} CurrencyMeta */

/** 本位幣。所有帳目最終都以它計價。 */
export const BASE_CURRENCY = 'TWD';

/** 依常見程度排序，選單由上往下就是亞洲熱門目的地優先。 */
export const CURRENCY_LIST = Object.freeze(
  [
    ['JPY', '日圓', '¥', 0, '🇯🇵'],
    ['KRW', '韓元', '₩', 0, '🇰🇷'],
    ['USD', '美元', 'US$', 2, '🇺🇸'],
    ['EUR', '歐元', '€', 2, '🇪🇺'],
    ['CNY', '人民幣', 'CN¥', 2, '🇨🇳'],
    ['HKD', '港幣', 'HK$', 2, '🇭🇰'],
    ['MOP', '澳門幣', 'MOP$', 2, '🇲🇴'],
    ['THB', '泰銖', '฿', 2, '🇹🇭'],
    ['VND', '越南盾', '₫', 0, '🇻🇳'],
    ['SGD', '新加坡幣', 'S$', 2, '🇸🇬'],
    ['MYR', '馬來西亞令吉', 'RM', 2, '🇲🇾'],
    ['IDR', '印尼盾', 'Rp', 0, '🇮🇩'],
    ['PHP', '菲律賓披索', '₱', 2, '🇵🇭'],
    ['KHR', '柬埔寨瑞爾', '៛', 0, '🇰🇭'],
    ['LAK', '寮國基普', '₭', 0, '🇱🇦'],
    ['INR', '印度盧比', '₹', 2, '🇮🇳'],
    ['GBP', '英鎊', '£', 2, '🇬🇧'],
    ['CHF', '瑞士法郎', 'CHF', 2, '🇨🇭'],
    ['AUD', '澳幣', 'A$', 2, '🇦🇺'],
    ['NZD', '紐西蘭幣', 'NZ$', 2, '🇳🇿'],
    ['CAD', '加幣', 'C$', 2, '🇨🇦'],
    ['SEK', '瑞典克朗', 'kr', 2, '🇸🇪'],
    ['NOK', '挪威克朗', 'kr', 2, '🇳🇴'],
    ['DKK', '丹麥克朗', 'kr', 2, '🇩🇰'],
    ['CZK', '捷克克朗', 'Kč', 2, '🇨🇿'],
    ['HUF', '匈牙利福林', 'Ft', 0, '🇭🇺'],
    ['PLN', '波蘭茲羅提', 'zł', 2, '🇵🇱'],
    ['TRY', '土耳其里拉', '₺', 2, '🇹🇷'],
    ['AED', '阿聯迪拉姆', 'AED', 2, '🇦🇪'],
    ['ILS', '以色列新謝克爾', '₪', 2, '🇮🇱'],
    ['EGP', '埃及鎊', 'E£', 2, '🇪🇬'],
    ['MXN', '墨西哥披索', 'MX$', 2, '🇲🇽'],
    ['BRL', '巴西雷亞爾', 'R$', 2, '🇧🇷'],
    ['ZAR', '南非蘭特', 'R', 2, '🇿🇦'],
  ].map(([code, name, symbol, decimals, flag]) =>
    Object.freeze({ code, name, symbol, decimals, flag }),
  ),
);

const BY_CODE = new Map(CURRENCY_LIST.map((c) => [c.code, c]));

/** 台幣自己的中繼資料（不在外幣選單裡，但格式化會用到）。 */
const TWD_META = Object.freeze({
  code: BASE_CURRENCY,
  name: '新台幣',
  symbol: 'NT$',
  decimals: 0,
  flag: '🇹🇼',
});

/**
 * 取得貨幣中繼資料。不在目錄裡的代碼（使用者手動輸入、或日後移除的貨幣）
 * 仍回傳可用的物件，讓舊帳目不會因為目錄變動而顯示壞掉。
 * @param {string} code
 * @returns {CurrencyMeta}
 */
export function currencyMeta(code) {
  const c = String(code || '').toUpperCase();
  if (c === BASE_CURRENCY) return TWD_META;
  return BY_CODE.get(c) || { code: c, name: c, symbol: c, decimals: 2, flag: '💱' };
}

/** 這個代碼是不是目錄裡的外幣。 */
export function isKnownCurrency(code) {
  return BY_CODE.has(String(code || '').toUpperCase());
}

/**
 * 把外幣金額格式化成「符號＋千分位」，小數位數依貨幣決定。
 * @param {string} code
 * @param {number} amount
 */
export function formatMoney(code, amount) {
  const m = currencyMeta(code);
  const n = Number.isFinite(+amount) ? +amount : 0;
  const body = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: m.decimals,
  });
  return (n < 0 ? '-' : '') + m.symbol + body;
}
