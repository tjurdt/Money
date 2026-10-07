/**
 * 外幣與匯率運算。
 *
 * 設計重點
 * 1. 帳目的 `total` 永遠是台幣。外幣資訊另存在 `record.fx`，
 *    所以分帳、折扣、統計、圖表這些既有邏輯完全不必知道外幣的存在。
 * 2. 匯率一律寫成「1 單位外幣 = 幾元台幣」。
 * 3. 帳目存的是**當下的匯率快照**。事後修改情境裡的匯率，不會改動已記的帳 ——
 *    否則一次改匯率就讓整趟旅行的歷史金額默默變動。
 *
 * 情境（trip）上的設定：
 *   trip.currencies = [{ code: 'JPY', rates: [Rate, ...] }]
 *   Rate = { id, type, label?, rate?, twd?, foreign? }
 *     type 'fixed'    固定匯率：rate 為 1 外幣 = rate 台幣
 *     type 'float'    浮動匯率：rate 只是參考值，每筆帳可自行調整
 *     type 'exchange' 換匯：用 twd 元台幣換到 foreign 外幣，匯率 = twd / foreign
 *
 * 帳目上的外幣資訊：
 *   record.fx = { cur, amount, twd, rate, rateId, rateType, rateLabel, orig }
 *     amount   外幣總額
 *     twd      換算後的台幣總額（＝ record.total）
 *     rateType 上述三種，或 'card'（刷卡，以帳單台幣金額反推匯率）
 *     orig     記帳當下以外幣計的原始內容（品項、優惠、分帳），編輯時還原用
 *
 * 外幣支出的品項、優惠、分帳全部以外幣輸入；儲存時整筆依「台幣總額 ÷ 外幣總額」
 * 等比換成台幣，record 頂層（total、items…）因此永遠是台幣，既有統計不必改。
 *
 * 純函式：不碰 DOM、不讀全域狀態。
 */
import { splitRatio } from './split.js';
import { currencyMeta, formatMoney } from './currencies.js';

/** 匯率類型的顯示名稱。 */
export const RATE_TYPES = Object.freeze({
  fixed: '固定匯率',
  float: '浮動匯率',
  exchange: '換匯',
  card: '信用卡刷卡',
});

const round2 = (n) => Math.round(n * 100) / 100;
const isPos = (n) => Number.isFinite(+n) && +n > 0;

/**
 * 一筆匯率換算成「1 外幣 = 幾元台幣」。無效資料回傳 0。
 * @param {{type?: string, rate?: number, twd?: number, foreign?: number}} r
 */
export function rateValue(r) {
  if (!r) return 0;
  if (r.type === 'exchange') return isPos(r.twd) && isPos(r.foreign) ? +r.twd / +r.foreign : 0;
  return isPos(r.rate) ? +r.rate : 0;
}

/** 匯率顯示用的數字：越小的匯率保留越多位數（日圓 0.2150、美元 31.52）。 */
export function formatRate(rate) {
  const n = +rate || 0;
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

/** 匯率的預設標籤，使用者沒有自訂名稱時顯示。 */
export function rateLabel(r, code) {
  if (r.label) return r.label;
  if (r.type === 'exchange')
    return `換匯 ${formatMoney('TWD', r.twd)}→${formatMoney(code, r.foreign)}`;
  return `${RATE_TYPES[r.type] || '匯率'} ${formatRate(rateValue(r))}`;
}

/** 外幣金額換成台幣，四捨五入到小數 2 位。 */
export function toTwd(amount, rate) {
  return round2((+amount || 0) * (+rate || 0));
}

/** 由台幣與外幣金額反推匯率；任一為 0 回傳 0。 */
export function impliedRate(twd, foreign) {
  return isPos(twd) && isPos(foreign) ? +twd / +foreign : 0;
}

/**
 * 清理情境上的貨幣設定：剔除壞掉的項目、補齊缺的陣列、貨幣代碼去重。
 * 寧可寬鬆 —— 只丟掉「沒有代碼」的貨幣與「算不出匯率」的匯率以外，一律保留。
 * @param {{currencies?: any}} trip
 * @returns {Array<{code: string, rates: object[]}>}
 */
export function tripCurrencies(trip) {
  const list = Array.isArray(trip?.currencies) ? trip.currencies : [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const code = String(c?.code || '').toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const rates = (Array.isArray(c.rates) ? c.rates : []).filter(
      (r) => r && r.id && rateValue(r) > 0,
    );
    out.push({ code, rates });
  }
  return out;
}

/** 找出情境上某貨幣的某筆匯率。 */
export function findRate(trip, code, rateId) {
  const cur = tripCurrencies(trip).find((c) => c.code === code);
  return cur?.rates.find((r) => r.id === rateId) || null;
}

/**
 * 一筆外幣支出要存進帳目的 fx 欄位。
 *
 * @param {{code: string, amount: number, rate: object|null, twdTotal?: number}} p
 *   rate 為 null 代表刷卡：必須給 twdTotal（帳單上的台幣金額），匯率由它反推。
 * @returns {object|null} 資料不足以算出匯率時回傳 null
 */
export function buildFx({ code, amount, rate, twdTotal }) {
  if (!isPos(amount)) return null;
  const twd = isPos(twdTotal) ? round2(+twdTotal) : 0;
  if (!rate) {
    const r = impliedRate(twd, amount);
    return r
      ? {
          cur: code,
          amount: +amount,
          twd,
          rate: r,
          rateId: null,
          rateType: 'card',
          rateLabel: RATE_TYPES.card,
        }
      : null;
  }
  const value = rateValue(rate);
  if (!value) return null;
  return {
    cur: code,
    amount: +amount,
    twd: twd || toTwd(amount, value),
    rate: value,
    rateId: rate.id,
    rateType: rate.type,
    rateLabel: rateLabel(rate, code),
  };
}

const ITEM_MONEY = ['price', 'grossPrice', 'unitPrice'];
const scaleNum = (v, k) => (v == null || !Number.isFinite(+v) ? v : round2(+v * k));

/** 品項的金額欄位等比縮放。 */
function scaleItems(items, k) {
  return (items || []).map((it) => {
    const out = { ...it };
    for (const f of ITEM_MONEY) if (f in out) out[f] = scaleNum(out[f], k);
    return out;
  });
}

/**
 * 把「以外幣輸入」的整筆帳目換成台幣。
 *
 * 換算比例 k ＝ 台幣總額 ÷ 外幣總額，全部品項與優惠金額等比乘上去，
 * 品項加總與總額之間的尾差補在最後一個有金額的品項上，確保「品項加總 ＝ 總額」。
 * 這同時處理了「品項是日圓、信用卡帳單是台幣」的情境：k 就是刷卡實際的匯率。
 *
 * @param {object} rec 表單算出的帳目（total、items… 都是外幣）
 * @param {object} fx buildFx 的結果（amount 是外幣總額、twd 是台幣總額）
 * @returns {object} 新帳目，頂層為台幣，fx.orig 保留外幣原貌
 */
export function toTwdRecord(rec, fx) {
  const k = fx.twd / fx.amount;
  let items = rec.items ? scaleItems(rec.items, k) : rec.items;
  if (items && items.length) {
    const priced = items.filter((i) => +i.price > 0);
    const last = priced[priced.length - 1];
    const sum = items.reduce((s, i) => s + (+i.price || 0), 0);
    if (last && Math.abs(sum - fx.twd) < 1) last.price = round2(last.price + (fx.twd - sum));
  }
  const orig = {
    total: rec.total,
    items: rec.items,
    grossTotal: rec.grossTotal ?? null,
    discountTotal: rec.discountTotal ?? 0,
    discountOverrideTotal: rec.discountOverrideTotal ?? null,
    myShare: rec.split ? rec.split.myShare : null,
  };
  return {
    ...rec,
    total: fx.twd,
    items,
    grossTotal: scaleNum(rec.grossTotal, k) ?? null,
    discountTotal: scaleNum(rec.discountTotal, k) ?? 0,
    discountOverrideTotal: scaleNum(rec.discountOverrideTotal, k) ?? null,
    split: rec.split
      ? { ...rec.split, myShare: Math.min(fx.twd, scaleNum(rec.split.myShare, k)) }
      : null,
    fx: { ...fx, orig },
  };
}

/**
 * 編輯外幣帳目時，還原成「當初以外幣輸入的樣子」，表單才能原樣顯示。
 * 沒有 orig 的舊外幣帳目（早期版本只存了台幣品項）則用 外幣總額 ÷ 台幣總額 反推。
 * 非外幣帳目原樣回傳。
 */
export function fxSourceRecord(rec) {
  if (!rec || !hasFx(rec)) return rec;
  const fx = rec.fx;
  const o = fx.orig;
  if (o)
    return {
      ...rec,
      total: o.total,
      items: o.items,
      grossTotal: o.grossTotal,
      discountTotal: o.discountTotal,
      discountOverrideTotal: o.discountOverrideTotal,
      split: rec.split ? { ...rec.split, myShare: o.myShare } : null,
      fx: { ...fx, twd: fx.twd ?? rec.total },
    };
  const k = rec.total > 0 ? fx.amount / rec.total : 1;
  return {
    ...rec,
    total: fx.amount,
    items: rec.items ? scaleItems(rec.items, k) : rec.items,
    grossTotal: scaleNum(rec.grossTotal, k) ?? null,
    discountTotal: scaleNum(rec.discountTotal, k) ?? 0,
    discountOverrideTotal: scaleNum(rec.discountOverrideTotal, k) ?? null,
    split: rec.split ? { ...rec.split, myShare: scaleNum(rec.split.myShare, k) } : null,
    fx: { ...fx, twd: fx.twd ?? rec.total },
  };
}

/** 帳目是不是外幣支付（有完整、可用的 fx 資訊）。 */
export function hasFx(r) {
  return !!r?.fx && !!r.fx.cur && isPos(r.fx.amount);
}

/** 屬於某個情境的支出帳目。 */
function tripExpenses(records, tripId) {
  return records.filter((r) => r.kind === 'expense' && r.scope && r.scope.trip === tripId);
}

/**
 * 換匯批次的餘額：這批換到多少外幣、已經花掉多少、還剩多少。
 *
 * 花費以帳目的**全額**外幣計算（現金是整筆付出去的，不因為分帳而少花）。
 * 剩餘金額若為負，代表這批現金不夠、其餘是用別的方式補的 —— 照實顯示。
 *
 * @returns {Array<{code, rateId, label, rate, twdCost, foreign, used, remaining, count}>}
 */
export function exchangeBalances(records, trip) {
  const exp = tripExpenses(records, trip?.id);
  const out = [];
  for (const c of tripCurrencies(trip)) {
    for (const r of c.rates) {
      if (r.type !== 'exchange') continue;
      const mine = exp.filter((x) => hasFx(x) && x.fx.cur === c.code && x.fx.rateId === r.id);
      const used = mine.reduce((s, x) => s + +x.fx.amount, 0);
      out.push({
        code: c.code,
        rateId: r.id,
        label: rateLabel(r, c.code),
        rate: rateValue(r),
        twdCost: +r.twd,
        foreign: +r.foreign,
        used,
        remaining: +r.foreign - used,
        count: mine.length,
      });
    }
  }
  return out;
}

/**
 * 一趟旅行的花費結算：以台幣為主，同時能拆到各幣別、各匯率。
 *
 * 所有金額都是「我負擔的部分」（跟其他畫面的支出口徑一致）。
 * 台幣總額 ＝ 台幣直接付款 ＋ 各外幣換算後的台幣，兩者相加一定等於整趟總額，
 * 不會因為換算而出現對不上的尾數。
 *
 * @returns {{
 *   totalTwd: number, count: number,
 *   twdOnly: {total: number, count: number},
 *   currencies: Array<{code: string, foreign: number, twd: number, count: number,
 *     avgRate: number, batches: Array<{key: string, label: string, type: string,
 *     foreign: number, twd: number, count: number, rate: number}>}>,
 *   balances: ReturnType<typeof exchangeBalances>
 * }}
 */
export function summarizeTripFx(records, trip) {
  const exp = tripExpenses(records, trip?.id);
  const twdOnly = { total: 0, count: 0 };
  const byCur = new Map();
  let totalTwd = 0;
  for (const r of exp) {
    const ratio = splitRatio(r);
    const twd = (+r.total || 0) * ratio;
    totalTwd += twd;
    if (!hasFx(r)) {
      twdOnly.total += twd;
      twdOnly.count++;
      continue;
    }
    addToCurrency(byCur, r, twd, ratio);
  }
  const currencies = [...byCur.values()]
    .map((c) => ({
      ...c,
      avgRate: c.foreign > 0 ? c.twd / c.foreign : 0,
      batches: [...c.batches.values()].sort((a, b) => b.twd - a.twd),
    }))
    .sort((a, b) => b.twd - a.twd);
  return {
    totalTwd,
    count: exp.length,
    twdOnly,
    currencies,
    balances: exchangeBalances(records, trip),
  };
}

function addToCurrency(byCur, r, twd, ratio) {
  const fx = r.fx;
  const foreign = +fx.amount * ratio;
  const cur = byCur.get(fx.cur) || {
    code: fx.cur,
    foreign: 0,
    twd: 0,
    count: 0,
    batches: new Map(),
  };
  cur.foreign += foreign;
  cur.twd += twd;
  cur.count++;
  const key = fx.rateType === 'card' ? 'card' : fx.rateId || `${fx.rateType}:${fx.rate}`;
  const b = cur.batches.get(key) || {
    key,
    label: fx.rateLabel || RATE_TYPES[fx.rateType] || '匯率',
    type: fx.rateType,
    foreign: 0,
    twd: 0,
    count: 0,
    rate: 0,
  };
  b.foreign += foreign;
  b.twd += twd;
  b.count++;
  b.rate = b.foreign > 0 ? b.twd / b.foreign : 0;
  cur.batches.set(key, b);
  byCur.set(fx.cur, cur);
}

/** 貨幣的顯示名稱，例如「🇯🇵 日圓 JPY」。 */
export function currencyTitle(code) {
  const m = currencyMeta(code);
  return `${m.flag} ${m.name} ${m.code}`;
}

/** 某筆匯率有幾筆帳目在用（刪除前提醒用）。 */
export function rateUsageCount(records, tripId, code, rateId) {
  return tripExpenses(records, tripId).filter(
    (r) => hasFx(r) && r.fx.cur === code && r.fx.rateId === rateId,
  ).length;
}

/** 某個貨幣有幾筆帳目在用。 */
export function currencyUsageCount(records, tripId, code) {
  return tripExpenses(records, tripId).filter((r) => hasFx(r) && r.fx.cur === code).length;
}
