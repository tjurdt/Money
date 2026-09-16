/**
 * 匯入資料的驗證。
 *
 * 匯入的 JSON 可能來自舊版、別的裝置，或被手動編輯過。
 * 原本的流程沒有任何驗證：`[...records, ...d.records].forEach(r => by[r.id] = r)`
 * 遇到 null 項目會直接拋錯，而形狀怪異的資料會被原樣寫進帳本並存檔。
 */
import { describe, it, expect } from 'vitest';
import { bootLegacyApi } from './harness.js';

const RECORD = (id, total = 100) => ({
  id,
  kind: 'expense',
  date: '2026-03-05',
  total,
  scope: { type: 'daily', trip: null },
  store: '測試',
  payment: '現金',
  items: [],
  category: '餐食',
  sub: null,
  catMode: 'whole',
  hashtags: [],
  note: '',
  split: null,
  inv: null,
});

/** 模擬匯入一份 JSON，回傳匯入後的帳目與 confirm 訊息。 */
function importJson(payload, existing = []) {
  const { api, close } = bootLegacyApi({
    storage: { 'ledger.v23.seeded': '1', 'ledger.v2.records': existing },
  });
  let confirmMessage = '';
  api.confirm = (msg) => {
    confirmMessage = msg;
    return true;
  };
  // 直接觸發 onchange 的處理邏輯：以假的 FileReader 餵入內容。
  api.eval(`
    (function () {
      const fr = { result: ${JSON.stringify(JSON.stringify(payload))} };
      const handler = ${'$'}('#importFile').onchange;
      const OriginalFileReader = FileReader;
      window.FileReader = function () {
        this.readAsText = () => { this.result = fr.result; this.onload(); };
      };
      handler({ target: { files: [new Blob()] } });
      window.FileReader = OriginalFileReader;
    })();
  `);
  const records = api.store.get('records');
  const trips = api.store.get('trips');
  close();
  return { records, trips, confirmMessage };
}

describe('匯入正常資料', () => {
  it('帳目被匯入', () => {
    const { records } = importJson({ records: [RECORD('a'), RECORD('b')] });
    expect(records.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('相同識別碼以匯入版本為準', () => {
    const { records } = importJson({ records: [RECORD('a', 999)] }, [RECORD('a', 100)]);
    expect(records).toHaveLength(1);
    expect(records[0].total).toBe(999);
  });
});

describe('匯入含壞資料的檔案', () => {
  const payload = { records: [RECORD('good'), null, 'not a record', { 沒有識別碼: true }] };

  it('壞掉的項目不會進入帳本', () => {
    const { records } = importJson(payload);
    expect(records.map((r) => r.id)).toEqual(['good']);
  });

  it('不會因為 null 項目而整個匯入失敗', () => {
    // 原本 `by[r.id] = r` 遇到 null 會拋 TypeError，整批匯入無聲中斷。
    const { records } = importJson(payload);
    expect(records).toHaveLength(1);
  });

  it('確認訊息告知使用者有幾筆被略過', () => {
    const { confirmMessage } = importJson(payload);
    expect(confirmMessage).toContain('3 筆');
    expect(confirmMessage).toContain('略過');
  });

  it('資料完好時不顯示略過訊息', () => {
    const { confirmMessage } = importJson({ records: [RECORD('a')] });
    expect(confirmMessage).not.toContain('略過');
  });
});

describe('匯入含壞行程的檔案', () => {
  it('非物件的行程被剔除，不影響其餘匯入', () => {
    const { records, trips } = importJson({
      records: [RECORD('a')],
      trips: [{ id: 't1', name: '日本' }, null, 'x'],
    });
    expect(records).toHaveLength(1);
    expect(trips.map((t) => t.id)).toEqual(['t1']);
  });
});
