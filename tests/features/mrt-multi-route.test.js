/**
 * 北捷票價：多段路程累加成品項。
 *
 * 原本按「套用」會直接覆寫總金額並關閉面板，一筆帳只能記一段路程。
 * 現在改成每按一次就加一條品項、面板保持開啟，
 * 因此一趟出門的好幾段捷運可以記在同一筆帳裡，總金額由品項自動加總。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootLegacyApi } from '../harness.js';

let api, doc, close;

/**
 * 直接注入票價資料，避免測試依賴外部網路。
 * 結構與 buildMrtData() 的產出一致：fares 以「起站|訖站」為鍵。
 */
const FARE_DATA = {
  updatedAt: Date.now(),
  stations: ['台北車站', '淡水', '士林'],
  fares: {
    '台北車站|淡水': { full: 50, discount: 25 },
    '台北車站|士林': { full: 25, discount: 12 },
    '淡水|士林': { full: 30, discount: 15 },
  },
};

beforeEach(() => {
  ({ api, close } = bootLegacyApi({
    storage: {
      'ledger.v23.seeded': '1',
      'ledger.v2.catsExpense': ['餐食', '交通'],
      'ledger.v2.subcats': { 交通: ['大眾運輸', '計程車／叫車'] },
      'ledger.v2.payments': ['現金'],
    },
  }));
  doc = api.document;
  api.eval(`
    mrtFareData = ${JSON.stringify(FARE_DATA)};
    mrtLoading = false;
    $('#fab').click();
  `);
});
afterEach(() => close());

/** 選定起訖站並按下「加入品項」。 */
function addRoute(from, to) {
  api.eval(`
    $('#mrtFrom').value = ${JSON.stringify(from)};
    $('#mrtTo').value = ${JSON.stringify(to)};
    updateMrtFareResult();
    $('#mrtApply').click();
  `);
}

const itemRows = () =>
  [...doc.querySelectorAll('#itemRows .itemrow')].map((r) => ({
    name: r.querySelector('.i-name').value,
    price: r.querySelector('.i-price').value,
  }));

describe('加入單段路程', () => {
  beforeEach(() => {
    api.eval('openMrtFare();');
    addRoute('台北車站', '淡水');
  });

  it('產生一條以路線命名的品項', () => {
    expect(itemRows()).toEqual([{ name: '捷運 台北車站 → 淡水', price: '50' }]);
  });

  it('品項區會自動展開', () => {
    expect(doc.querySelector('#fld-items').classList.contains('hidden')).toBe(false);
  });

  it('總金額由品項加總得出', () => {
    expect(doc.querySelector('#f-total').value).toBe('50');
  });

  it('自動帶入店家與交通分類', () => {
    expect(doc.querySelector('#f-store').value).toBe('臺北捷運');
    expect(api.eval('selCat')).toBe('交通');
    expect(api.eval('selSub')).toBe('大眾運輸');
  });

  it('面板保持開啟，可以接著加下一段', () => {
    expect(doc.querySelector('#mrtSheet').classList.contains('show')).toBe(true);
  });
});

describe('連續加入多段路程', () => {
  beforeEach(() => {
    api.eval('openMrtFare();');
    addRoute('台北車站', '淡水');
    addRoute('淡水', '士林');
  });

  it('每一段各自成為一條品項', () => {
    expect(itemRows()).toEqual([
      { name: '捷運 台北車站 → 淡水', price: '50' },
      { name: '捷運 淡水 → 士林', price: '30' },
    ]);
  });

  it('總金額為各段加總', () => {
    expect(doc.querySelector('#f-total').value).toBe('80');
  });

  it('面板顯示本次已加入的段數與小計', () => {
    const added = doc.querySelector('#mrtAdded');
    expect(added.hidden).toBe(false);
    expect(added.textContent).toContain('2 段');
    expect(added.textContent).toContain('$80');
  });
});

describe('接續路線的輸入便利性', () => {
  it('加入後把訖站帶成下一段的起站', () => {
    // 多段路程通常是接續的（A→B、B→C）。
    api.eval('openMrtFare();');
    addRoute('台北車站', '淡水');
    expect(doc.querySelector('#mrtFrom').value).toBe('淡水');
    expect(doc.querySelector('#mrtTo').value).toBe('');
  });
});

describe('不覆蓋使用者已填的內容', () => {
  it('已填店家時不改寫', () => {
    api.eval("openMrtFare(); $('#f-store').value = '通勤';");
    addRoute('台北車站', '淡水');
    expect(doc.querySelector('#f-store').value).toBe('通勤');
  });

  it('第二段不再重設分類', () => {
    api.eval('openMrtFare();');
    addRoute('台北車站', '淡水');
    api.eval("selCat = '餐食'; renderChipSelectors();");
    addRoute('淡水', '士林');
    expect(api.eval('selCat')).toBe('餐食');
  });
});

describe('重新開啟面板', () => {
  it('已加入清單會重新計次', () => {
    api.eval('openMrtFare();');
    addRoute('台北車站', '淡水');
    api.eval('closeMrtFare(); openMrtFare();');
    expect(doc.querySelector('#mrtAdded').hidden).toBe(true);
  });

  it('但先前加入的品項仍保留在表單上', () => {
    api.eval('openMrtFare();');
    addRoute('台北車站', '淡水');
    api.eval('closeMrtFare(); openMrtFare();');
    expect(itemRows()).toHaveLength(1);
  });
});

describe('票種切換', () => {
  it('優惠票使用優惠價', () => {
    api.eval("openMrtFare(); mrtFareType = 'discount';");
    addRoute('台北車站', '淡水');
    expect(itemRows()[0].price).toBe('25');
  });
});
