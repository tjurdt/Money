/**
 * 單向資料流的整合測試。
 *
 * P4b 的核心主張：**改了資料，畫面自動更新，不必記得呼叫 renderAll()**。
 *
 * 原本的寫法是「改資料 → 手動呼叫 renderAll()」，22 處呼叫點，
 * 漏掉任何一處畫面就停在舊資料上；而新增畫面還得回頭改 renderAll() 本身。
 * 這裡驗證改成註冊制之後，資料變動確實會自動推到畫面上。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootLegacyApi } from './harness.js';

const RECORD = (id, store_, total) => ({
  id,
  kind: 'expense',
  date: '2026-03-05',
  total,
  scope: { type: 'daily', trip: null },
  store: store_,
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

let api, close;
beforeEach(() => {
  ({ api, close } = bootLegacyApi({
    storage: {
      'ledger.v23.seeded': '1',
      'ledger.v2.catsExpense': ['餐食', '交通'],
      'ledger.v2.payments': ['現金'],
    },
  }));
  api.eval("listPeriod = { mode: 'all', from: '', to: '' }; renderAll();");
});
afterEach(() => close());

/** 等待 views.js 在微任務中合併後的重繪。 */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('資料變動自動推到畫面', () => {
  it('新增帳目後清單自動更新，不需呼叫 renderAll', async () => {
    expect(api.document.querySelector('#recordList').innerHTML).toContain('這裡還沒有帳目');

    api.store.set('records', [RECORD('r1', '拉麵店', 300)]);
    await flush();

    expect(api.document.querySelector('#recordList').innerHTML).toContain('拉麵店');
  });

  it('頂部摘要也跟著更新', async () => {
    api.store.set('records', [RECORD('r1', '拉麵店', 300)]);
    await flush();
    expect(api.document.querySelector('#sumExpense').textContent).toBe('$300');
  });

  it('刪除帳目後畫面回到空狀態', async () => {
    api.store.set('records', [RECORD('r1', '拉麵店', 300)]);
    await flush();
    api.store.set('records', []);
    await flush();
    expect(api.document.querySelector('#recordList').innerHTML).toContain('這裡還沒有帳目');
  });

  it('透過 legacy 的一般賦值語法也會自動更新', async () => {
    // src/legacy/ 裡的程式碼寫的是 `records = [...records, rec]`，
    // 全域存取器會把它轉成 store.set，因此同樣會觸發重繪。
    api.eval(`records = [...records, ${JSON.stringify(RECORD('r2', '咖啡廳', 150))}];`);
    await flush();
    expect(api.document.querySelector('#recordList').innerHTML).toContain('咖啡廳');
  });
});

describe('只重繪受影響且啟用中的畫面', () => {
  it('清單頁啟用時，改 records 會更新清單', async () => {
    api.store.set('records', [RECORD('r1', '拉麵店', 300)]);
    await flush();
    expect(api.document.querySelector('#recordList').innerHTML).toContain('拉麵店');
  });

  it('沒有啟用的分頁不會被重繪', async () => {
    // 投資頁此時是隱藏的，其內容應維持初始狀態。
    const before = api.document.querySelector('#holdList').innerHTML;
    api.store.set('records', [RECORD('r1', '拉麵店', 300)]);
    await flush();
    expect(api.document.querySelector('#holdList').innerHTML).toBe(before);
  });

  it('切到投資頁時才渲染它', () => {
    const navButtons = [...api.document.querySelectorAll('.nav button')];
    const investBtn = navButtons.find((b) => b.dataset.view === 'invest');
    investBtn.click();
    expect(api.document.querySelector('#view-invest').classList.contains('active')).toBe(true);
    expect(api.document.querySelector('#invCost').textContent).toBe('$0');
  });
});

describe('批次變動只重繪一次', () => {
  it('CSV 匯入那類批次修改，事後一次通知即可更新畫面', async () => {
    // 迴圈中就地修改（避免 O(n²)），最後以 touchMany 通知。
    api.eval(`
      records.push(${JSON.stringify(RECORD('b1', '批次一', 100))});
      records.push(${JSON.stringify(RECORD('b2', '批次二', 200))});
    `);
    await flush();
    // 就地修改不會被存取器攔到，畫面應仍是舊的。
    expect(api.document.querySelector('#recordList').innerHTML).not.toContain('批次一');

    api.eval("store.touchMany(['records']);");
    await flush();
    const html = api.document.querySelector('#recordList').innerHTML;
    expect(html).toContain('批次一');
    expect(html).toContain('批次二');
  });
});

describe('新增畫面不必改動既有程式碼', () => {
  it('註冊一個新畫面後，它會跟著狀態變動自動重繪', async () => {
    // 這是 P4b 要交付的承諾：加畫面只需在自己的檔案裡 registerView(...)，
    // 不必回頭改 renderAll()、也不必改分頁切換的判斷。
    api.eval(`
      globalThis.__newViewRenders = 0;
      registerView({
        id: '__test__',
        deps: ['records'],
        isActive: () => true,
        render: () => { globalThis.__newViewRenders++; },
      });
    `);
    const before = api.__newViewRenders;

    api.store.set('records', [RECORD('r1', '拉麵店', 300)]);
    await flush();

    expect(api.__newViewRenders).toBe(before + 1);
  });

  it('renderAll 不再手動列舉各個渲染函式', () => {
    // 原本是 renderScopePill(); renderMonthBar(); renderSummary(); ...
    // 漏加一行就是畫面不同步。現在它只是轉呼叫註冊表。
    const src = api.eval('renderAll.toString()');
    expect(src).toContain('renderAllViews');
    expect(src).not.toContain('renderList()');
    expect(src).not.toContain('renderSummary()');
  });
});

describe('畫面註冊表', () => {
  it('各分頁與常駐元件都已註冊', () => {
    expect(api.registeredViewIds().sort()).toEqual([
      'appbar',
      'chart',
      'install',
      'invest',
      'list',
      'settings',
    ]);
  });
});
