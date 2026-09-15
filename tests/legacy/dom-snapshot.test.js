/**
 * DOM 快照：鎖住 app 啟動後的實際畫面。
 *
 * P2 要把 8 處 monkey-patch 合併回本體函式，這會改變某些邏輯的執行時機
 * （原本包裝在最後才套用，合併後從一開始就生效）。
 * 單純的函式單元測試看不出這種差異，必須比對實際渲染結果。
 *
 * 這些快照是在 P2 動工「之前」產生的，代表合併前的畫面。
 * 合併過程中若快照變動，就是行為被改了 —— 先確認是否為預期。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';
import * as F from '../fixtures/records.js';

/** 涵蓋分帳、逐項分類、收入與旅遊情境，讓多數渲染路徑都被走到。 */
const SEED = {
  'ledger.v23.seeded': '1',
  'ledger.v2.records': [F.plainExpense, F.splitEven, F.perItemCategories, F.income, F.tripExpense],
  'ledger.v2.catsExpense': ['餐食', '交通', '日用品', '娛樂', '居家'],
  'ledger.v2.catsIncome': ['薪資', '其他收入'],
  'ledger.v2.payments': ['信用卡', '現金'],
  'ledger.v2.subcats': { 餐食: ['早餐', '午餐', '晚餐', '點心／飲料'] },
  'ledger.v2.catColors': { 餐食: '#0d6e60', 日用品: '#3269c0' },
  'ledger.v2.trips': [{ id: 't-japan', name: '日本', from: '2026-04-08', to: '2026-04-15' }],
};

let api, doc, close;
beforeAll(() => {
  ({ api, close } = bootLegacyApi({ storage: SEED }));
  doc = api.document;
  // 帳目日期分散在不同月份，固定檢視範圍以免快照隨當前時間漂移。
  api.eval("listPeriod = { mode: 'all', from: '', to: '' }; renderAll();");
});
afterAll(() => close());

const html = (sel) => doc.querySelector(sel)?.innerHTML.trim() ?? '(找不到元素)';
const text = (sel) => doc.querySelector(sel)?.textContent.trim() ?? '(找不到元素)';

describe('啟動後的畫面', () => {
  it('帳目清單', () => {
    expect(html('#recordList')).toMatchSnapshot();
  });

  it('頂部收支摘要', () => {
    expect({
      支出: text('#sumExpense'),
      收入: text('#sumIncome'),
      結餘: text('#sumNet'),
    }).toMatchSnapshot();
  });

  it('清單篩選列的狀態', () => {
    // renderFilterChips 的包裝會同步 #listTypeSelect 的值。
    expect({
      類型選單: doc.querySelector('#listTypeSelect')?.value,
      篩選chips: html('#filterChips'),
    }).toMatchSnapshot();
  });
});

describe('新增帳目表單', () => {
  beforeAll(() => {
    doc.querySelector('#fab').click();
  });

  it('四個區塊的顯示狀態', () => {
    // openSheet 與 updateKindUI 的包裝都會呼叫 syncEntryBlocks。
    const blocks = [...doc.querySelectorAll('.entry-block')].map((el) => ({
      id: el.id,
      隱藏: el.classList.contains('hidden'),
    }));
    expect(blocks).toMatchSnapshot();
  });

  it('分類選擇鈕的著色', () => {
    // syncCompactChoiceLabels 的包裝會依分類顏色輕染。
    const b = doc.querySelector('#catSelectBtn');
    expect({
      背景: b?.style.background || '(無)',
      邊框: b?.style.borderColor || '(無)',
      已著色: b?.classList.contains('cat-tinted'),
    }).toMatchSnapshot();
  });

  it('備註區塊的展開狀態', () => {
    expect(doc.querySelector('#noteDetails')?.open).toMatchSnapshot();
  });
});

describe('分類著色（P2 合併後才從一開始就生效）', () => {
  it('選定分類後，選擇鈕依分類顏色著色', () => {
    api.eval("selCat = '餐食'; selSub = null; syncCompactChoiceLabels();");
    const b = doc.querySelector('#catSelectBtn');
    expect(b.classList.contains('cat-tinted')).toBe(true);
    expect(b.style.background).not.toBe('');
    expect(b.style.borderColor).not.toBe('');
  });

  it('同時有分類與子分類時，子分類鈕也著色', () => {
    api.eval("selCat = '餐食'; selSub = '晚餐'; syncCompactChoiceLabels();");
    const sb = doc.querySelector('#subSelectBtn');
    expect(sb.style.background).not.toBe('');
    expect(sb.style.borderColor).not.toBe('');
  });

  it('清除分類後著色一併移除', () => {
    api.eval('selCat = null; selSub = null; syncCompactChoiceLabels();');
    const b = doc.querySelector('#catSelectBtn');
    const sb = doc.querySelector('#subSelectBtn');
    expect(b.classList.contains('cat-tinted')).toBe(false);
    expect(b.style.background).toBe('');
    expect(sb.style.background).toBe('');
  });
});

describe('切換到投資與設定頁', () => {
  it('投資頁摘要', () => {
    expect({
      成本: text('#invCost'),
      未實現: text('#invUnreal'),
      已實現: text('#invRealized'),
      股利: text('#invDiv'),
    }).toMatchSnapshot();
  });

  it('設定頁的固定支出區塊', () => {
    // renderSettings 的包裝會額外呼叫 renderRecurringRules。
    expect(html('#recurringManage')).toMatchSnapshot();
  });
});
