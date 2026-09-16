/**
 * 資料健康狀態是否真的顯示給使用者。
 *
 * 資料出問題卻靜默處理，等使用者發現時往往已經來不及了。
 * 這裡確認問題會實際渲染到設定頁上，而不只是記錄在記憶體裡。
 */
import { describe, it, expect } from 'vitest';
import { bootLegacyApi } from './harness.js';

/** 開啟設定頁並回傳警示區塊的內容。 */
function dataHealthHtml(storage) {
  const { api, close } = bootLegacyApi({ storage });
  api.eval('renderSettings();');
  const box = api.document.querySelector('#storageWarn');
  const html = box.innerHTML;
  const visible = box.style.display !== 'none';
  close();
  return { html, visible };
}

describe('資料完好時不打擾使用者', () => {
  it('沒有任何警示', () => {
    const { html, visible } = dataHealthHtml({ 'ledger.v23.seeded': '1' });
    expect(visible).toBe(false);
    expect(html).toBe('');
  });
});

describe('資料被隔離時會告知使用者', () => {
  const broken = { 'ledger.v2.records': { oops: true }, 'ledger.v23.seeded': '1' };

  it('顯示警示', () => {
    expect(dataHealthHtml(broken).visible).toBe(true);
  });

  it('說明發生了什麼，以及資料沒有被刪除', () => {
    const { html } = dataHealthHtml(broken);
    expect(html).toContain('格式不符');
    expect(html).toContain('沒有被刪除');
  });
});

describe('部分項目被剔除時會告知筆數', () => {
  it('說明剔除了幾筆、其餘正常', () => {
    const good = {
      id: 'keep',
      kind: 'expense',
      date: '2026-03-05',
      total: 100,
      items: [],
      split: null,
    };
    const { html, visible } = dataHealthHtml({
      'ledger.v2.records': [good, null, 'x'],
      'ledger.v23.seeded': '1',
    });
    expect(visible).toBe(true);
    expect(html).toContain('2 筆');
    expect(html).toContain('其餘資料正常');
  });
});
