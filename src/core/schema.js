/**
 * 資料形狀的驗證與修復。
 *
 * 存在的理由：`load()` 原本只防 JSON 解析失敗，不檢查型別。
 * 若 `ledger.v2.records` 存到「合法 JSON 但不是陣列」的值
 * （雲端同步寫壞、匯入異常、手動編輯），啟動時會拋
 * `records.forEach is not a function`，整段腳本當場中止 ——
 * 事件監聽全未註冊，app 變成沒有反應的空殼，且沒有任何 app 內的復原途徑。
 *
 * 設計原則
 *   1. 能修就修：缺少的陣列、null 欄位一律補上，不因小瑕疵丟棄整筆資料。
 *   2. 不能用才隔離：真正無法使用的值搬到隔離區保存，不是刪除。
 *   3. 絕不靜默：修復與隔離都會記錄下來，讓使用者看得到。
 *
 * 寧可寬鬆也不要嚴格 —— 這些是使用者累積多年的帳本，
 * 過度嚴格的驗證造成的資料損失，比讓一筆奇怪的資料通過更嚴重。
 */

/** 帳目的合法類型。 */
export const RECORD_KINDS = Object.freeze(['expense', 'income', 'investment', 'settlement']);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * 這筆帳目還能不能用？
 *
 * 只檢查「少了就會讓下游壞掉」的欄位：必須是物件、有識別碼、金額是有限數字。
 * 其餘欄位交給 repairRecord 補齊。
 *
 * @param {*} r
 * @returns {boolean}
 */
export function isUsableRecord(r) {
  if (!isPlainObject(r)) return false;
  if (r.id == null || (typeof r.id !== 'string' && typeof r.id !== 'number')) return false;
  if (!isFiniteNumber(+r.total)) return false;
  return true;
}

/**
 * 補齊帳目缺少的欄位，讓下游程式碼不必到處防禦性判斷。
 *
 * 只補結構、不臆測數值：例如 items 缺少時補成空陣列，
 * 但不會去猜使用者原本買了什麼。
 *
 * @param {object} r
 * @returns {object} 新物件，不修改輸入
 */
export function repairRecord(r) {
  const kind = RECORD_KINDS.includes(r.kind) ? r.kind : 'expense';
  return {
    ...r,
    id: String(r.id),
    kind,
    total: +r.total,
    date: typeof r.date === 'string' ? r.date : '',
    createdAt: isFiniteNumber(r.createdAt) ? r.createdAt : Date.now(),
    items: Array.isArray(r.items) ? r.items.filter(isPlainObject) : [],
    hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
    note: typeof r.note === 'string' ? r.note : '',
    scope: isPlainObject(r.scope) ? r.scope : { type: 'daily', trip: null },
    split: isPlainObject(r.split) ? r.split : null,
    inv: isPlainObject(r.inv) ? r.inv : null,
    category: r.category ?? null,
    sub: r.sub ?? null,
    catMode: r.catMode ?? null,
  };
}

/**
 * 從任意值中救出可用的帳目。
 *
 * @param {*} value 從儲存層讀到的原始值
 * @returns {{records: object[], dropped: *[], fatal: boolean}}
 *   fatal 為 true 代表整個值無法使用（例如不是陣列），原值應送進隔離區。
 */
export function salvageRecords(value) {
  if (!Array.isArray(value)) return { records: [], dropped: [], fatal: true };
  const records = [];
  const dropped = [];
  for (const r of value) {
    if (isUsableRecord(r)) records.push(repairRecord(r));
    else dropped.push(r);
  }
  return { records, dropped, fatal: false };
}

/** 每個狀態鍵的形狀定義：檢查、以及無法通過時如何救援。 */
export const STATE_SHAPES = Object.freeze({
  records: {
    check: Array.isArray,
    salvage: salvageRecords,
  },
  catsExpense: { check: isStringArray, salvage: salvageStringArray },
  catsIncome: { check: isStringArray, salvage: salvageStringArray },
  payments: { check: isStringArray, salvage: salvageStringArray },
  subcats: { check: isPlainObject, salvage: salvageObject },
  prices: { check: isPlainObject, salvage: salvageObject },
  catColors: { check: isPlainObject, salvage: salvageObject },
  trips: { check: Array.isArray, salvage: salvageObjectArray },
  currentScope: { check: isPlainObject, salvage: salvageObject },
  settings: { check: isPlainObject, salvage: salvageObject },
  // twseCache 允許為 null（代表尚未抓過行情）。
  twseCache: { check: (v) => v === null || isPlainObject(v), salvage: salvageNullableObject },
});

function isStringArray(v) {
  return Array.isArray(v);
}

/** 字串陣列：非陣列視為無法使用；陣列內的非字串項目逐一剔除。 */
function salvageStringArray(value) {
  if (!Array.isArray(value)) return { value: [], dropped: [], fatal: true };
  const out = [];
  const dropped = [];
  for (const x of value) {
    if (typeof x === 'string') out.push(x);
    else dropped.push(x);
  }
  return { value: out, dropped, fatal: false };
}

function salvageObjectArray(value) {
  if (!Array.isArray(value)) return { value: [], dropped: [], fatal: true };
  const out = [];
  const dropped = [];
  for (const x of value) {
    if (isPlainObject(x)) out.push(x);
    else dropped.push(x);
  }
  return { value: out, dropped, fatal: false };
}

function salvageObject(value) {
  if (!isPlainObject(value)) return { value: {}, dropped: [], fatal: true };
  return { value, dropped: [], fatal: false };
}

function salvageNullableObject(value) {
  if (value === null || isPlainObject(value)) return { value, dropped: [], fatal: false };
  return { value: null, dropped: [], fatal: true };
}

/**
 * 依狀態鍵檢查並救援一個值。
 *
 * @param {string} key 狀態鍵
 * @param {*} value 從儲存層讀到的值
 * @param {*} fallback 無法使用時的預設值
 * @returns {{value: *, fatal: boolean, dropped: *[]}}
 */
export function validateStateValue(key, value, fallback) {
  const shape = STATE_SHAPES[key];
  if (!shape) return { value, fatal: false, dropped: [] };
  if (shape.check(value)) {
    // 形狀正確，但內容仍可能有壞掉的項目（例如陣列裡混入 null）。
    const salvaged = shape.salvage(value);
    const out = key === 'records' ? salvaged.records : salvaged.value;
    return { value: out, fatal: false, dropped: salvaged.dropped };
  }
  return { value: fallback, fatal: true, dropped: [] };
}
