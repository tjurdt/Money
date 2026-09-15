/**
 * 特徵化測試：格式化與日期工具。
 * 這些是頂層 const，不會掛上 window，必須透過 grab() 取得。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootLegacyApi } from '../harness.js';

let grab, close;
beforeAll(() => { ({ grab, close } = bootLegacyApi()); });
afterAll(() => close());

describe('nf — 金額格式化', () => {
  it('加上錢號與千分位，並四捨五入到整數', () => {
    const nf = grab('nf');
    expect(nf(0)).toBe('$0');
    expect(nf(1234.5)).toBe('$1,235');
    expect(nf(1234.4)).toBe('$1,234');
    expect(nf(1000000)).toBe('$1,000,000');
  });
  it('負數的錢號在負號前（現況）', () => {
    // 目前輸出為 "$-99" 而非 "-$99"。P3 若要調整顯示，這條會變紅。
    expect(grab('nf')(-99)).toBe('$-99');
  });
});

describe('esc — HTML 轉義', () => {
  it('轉義 & < > 與雙引號', () => {
    expect(grab('esc')('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
  it('null 與 undefined 轉成空字串', () => {
    const esc = grab('esc');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
  it('不轉義單引號（現況，屬性務必用雙引號包）', () => {
    expect(grab('esc')("it's")).toBe("it's");
  });
});

describe('日期工具', () => {
  it('ymKey 產生 YYYY-MM', () => {
    expect(grab('ymKey')('2026-03-05')).toBe('2026-03');
    expect(grab('ymKey')('2026-12-31')).toBe('2026-12');
  });
  it('md 產生 M/D，空值回傳空字串', () => {
    const md = grab('md');
    expect(md('2026-03-05')).toBe('3/5');
    expect(md('')).toBe('');
  });
  it('todayISO 產生 YYYY-MM-DD', () => {
    expect(grab('todayISO')()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
