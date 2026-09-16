/**
 * store 的單元測試。直接 import 模組，不需要 jsdom。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as store from '../../src/core/store.js';
import { __resetMemStore } from '../../src/core/storage.js';

beforeEach(() => {
  __resetMemStore();
  store.__clearListeners();
  store.initStore();
});
afterEach(() => store.__clearListeners());

describe('狀態鍵', () => {
  it('管理 11 個有持久化的狀態', () => {
    expect(store.STATE_KEYS).toEqual([
      'records',
      'catsExpense',
      'catsIncome',
      'payments',
      'subcats',
      'prices',
      'twseCache',
      'catColors',
      'trips',
      'currentScope',
      'settings',
    ]);
  });

  it('未知的鍵會拋錯，而不是靜默回傳 undefined', () => {
    // 打錯字若靜默通過，會變成很難追的 bug。
    expect(() => store.get('recordz')).toThrow(/沒有這個鍵/);
    expect(() => store.set('recordz', 1)).toThrow(/沒有這個鍵/);
  });
});

describe('預設值', () => {
  it('沒有儲存資料時給出預設值', () => {
    expect(store.get('records')).toEqual([]);
    expect(store.get('subcats')).toEqual({});
    expect(store.get('twseCache')).toBeNull();
    expect(store.get('currentScope')).toEqual({ type: 'daily', trip: null });
  });

  it('每次初始化都拿到新的物件實例，不會共用參考', () => {
    const a = store.get('records');
    a.push('髒東西');
    store.initStore();
    expect(store.get('records')).toEqual([]);
  });
});

describe('讀寫', () => {
  it('set 之後 get 拿得到新值', () => {
    store.set('records', [{ id: 'r1' }]);
    expect(store.get('records')).toEqual([{ id: 'r1' }]);
  });

  it('snapshot 回傳目前所有狀態', () => {
    store.set('catsExpense', ['餐食']);
    expect(store.snapshot().catsExpense).toEqual(['餐食']);
  });
});

describe('訂閱', () => {
  it('set 會以鍵名通知訂閱者', () => {
    const fn = vi.fn();
    store.subscribe(fn);
    store.set('records', []);
    expect(fn).toHaveBeenCalledWith('records');
  });

  it('touch 用於就地修改後的通知', () => {
    // 存取器攔不到 records.push(...)，需要明確通知。
    const fn = vi.fn();
    store.subscribe(fn);
    store.get('records').push({ id: 'x' });
    expect(fn).not.toHaveBeenCalled();
    store.touch('records');
    expect(fn).toHaveBeenCalledWith('records');
  });

  it('取消訂閱後不再收到通知', () => {
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    store.set('records', []);
    expect(fn).not.toHaveBeenCalled();
  });

  it('單一訂閱者拋錯不影響其他訂閱者', () => {
    // 一個畫面的渲染出錯，不該讓其他畫面也停止更新。
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('渲染失敗');
    });
    const good = vi.fn();
    store.subscribe(bad);
    store.subscribe(good);
    expect(() => store.set('records', [])).not.toThrow();
    expect(good).toHaveBeenCalledWith('records');
    err.mockRestore();
  });
});

describe('持久化', () => {
  it('persist 把目前值寫入儲存層，重新初始化後仍在', () => {
    store.set('catsIncome', ['薪資', '獎金']);
    store.persist('catsIncome');
    store.initStore();
    expect(store.get('catsIncome')).toEqual(['薪資', '獎金']);
  });

  it('沒有 persist 的變動不會留存', () => {
    // set 刻意不自動寫入儲存層，避免每次暫時性變動都打到 localStorage。
    store.set('catsIncome', ['只存在記憶體']);
    store.initStore();
    expect(store.get('catsIncome')).toEqual([]);
  });
});

describe('全域存取器', () => {
  it('安裝後可用一般變數語法讀寫', () => {
    const target = {};
    store.installGlobals(target);
    expect(target.records).toEqual([]);
    target.records = [{ id: 'via-global' }];
    expect(store.get('records')).toEqual([{ id: 'via-global' }]);
  });

  it('透過存取器賦值同樣會通知訂閱者', () => {
    const target = {};
    store.installGlobals(target);
    const fn = vi.fn();
    store.subscribe(fn);
    target.settings = { osm: true };
    expect(fn).toHaveBeenCalledWith('settings');
  });

  it('存取器讀到的是 store 的同一個物件', () => {
    const target = {};
    store.installGlobals(target);
    expect(target.subcats).toBe(store.get('subcats'));
  });
});
