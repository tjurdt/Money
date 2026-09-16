/**
 * 投資相關的純計算。
 *
 * 目前只涵蓋交易成本試算。持股成本與損益（investStatsForRange）仍讀取
 * 全域 records / prices，待 P4 狀態集中後再抽成純函式。
 */

/** 國泰證券電子下單手續費率（已含折扣）。 */
export const CATHAY_STOCK_FEE_RATE = 0.000399;

/** 台股一般賣出證券交易稅率。 */
export const TW_STOCK_TAX_RATE = 0.003;

/** 當日沖銷賣出證交稅減半。 */
export const TW_DAYTRADE_TAX_RATE = 0.0015;

/**
 * 試算一筆股票交易的手續費與交易稅。
 *
 * 買進只收手續費；賣出另加證交稅，當沖稅率減半。
 * 成交金額無條件捨去到元，手續費與稅四捨五入到元。
 *
 * @param {number} sh 股數
 * @param {number} pr 成交價
 * @param {'buy'|'sell'} action
 * @param {boolean} [dayTrade] 是否為當沖
 * @returns {{value:number, commission:number, tax:number, total:number, taxRate:number}}
 */
export function estimateCathayStockCosts(sh, pr, action, dayTrade = false) {
  const value = Math.max(0, Math.floor((+sh || 0) * (+pr || 0))),
    commission = value ? Math.round(value * CATHAY_STOCK_FEE_RATE) : 0,
    tax =
      action === 'sell' && value
        ? Math.round(value * (dayTrade ? TW_DAYTRADE_TAX_RATE : TW_STOCK_TAX_RATE))
        : 0;
  return {
    value,
    commission,
    tax,
    total: commission + tax,
    taxRate: action === 'sell' ? (dayTrade ? TW_DAYTRADE_TAX_RATE : TW_STOCK_TAX_RATE) : 0,
  };
}
