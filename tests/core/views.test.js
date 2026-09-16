/**
 * 畫面註冊表的單元測試。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as views from '../../src/core/views.js';
import * as store from '../../src/core/store.js';
import { __resetMemStore } from '../../src/core/storage.js';

beforeEach(() => {
  __resetMemStore();
  views.__clearViews();
  store.__clearListeners();
  store.initStore();
});
afterEach(() => {
  views.__clearViews();
  store.__clearListeners();
});

const view = (id, deps, render) => ({ id, deps, render, isActive: () => true });

describe('註冊', () => {
  it('缺少必要欄位時拋錯', () => {
    expect(() => views.registerView({})).toThrow(/registerView/);
    expect(() => views.registerView({ id: 'x' })).toThrow(/registerView/);
  });

  it('同一個 id 重複註冊會覆蓋，不會重繪兩次', () => {
    const first = vi.fn();
    const second = vi.fn();
    views.registerView(view('a', [], first));
    views.registerView(view('a', [], second));
    views.renderAllViews();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('回傳的函式可以取消註冊', () => {
    const render = vi.fn();
    const off = views.registerView(view('a', [], render));
    off();
    views.renderAllViews();
    expect(render).not.toHaveBeenCalled();
  });
});

describe('依相依重繪', () => {
  it('只重繪依賴了變動狀態的畫面', () => {
    const onRecords = vi.fn();
    const onSettings = vi.fn();
    views.registerView(view('a', ['records'], onRecords));
    views.registerView(view('b', ['settings'], onSettings));

    views.renderViewsFor(['records']);
    expect(onRecords).toHaveBeenCalledOnce();
    expect(onSettings).not.toHaveBeenCalled();
  });

  it('依賴多個狀態時，任一變動都會重繪', () => {
    const render = vi.fn();
    views.registerView(view('a', ['records', 'trips'], render));
    views.renderViewsFor(['trips']);
    expect(render).toHaveBeenCalledOnce();
  });

  it('沒有啟用的畫面不重繪', () => {
    const render = vi.fn();
    views.registerView({ id: 'a', deps: ['records'], render, isActive: () => false });
    views.renderViewsFor(['records']);
    expect(render).not.toHaveBeenCalled();
  });
});

describe('錯誤隔離', () => {
  it('單一畫面拋錯不影響其他畫面', () => {
    // 一個畫面壞掉不該讓整個介面停止更新。
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('渲染失敗');
    });
    const good = vi.fn();
    views.registerView(view('bad', ['records'], bad));
    views.registerView(view('good', ['records'], good));

    expect(() => views.renderViewsFor(['records'])).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    err.mockRestore();
  });
});

describe('避免無限重繪', () => {
  it('重繪過程中改到狀態，不會再觸發一輪重繪', () => {
    let count = 0;
    views.registerView(
      view('a', ['records'], () => {
        count++;
        // 渲染時順手改了狀態 —— 沒有防護就會無限迴圈。
        store.set('records', []);
      }),
    );
    views.connectStore();
    views.renderViewsFor(['records']);
    expect(count).toBe(1);
  });
});

describe('接上 store', () => {
  it('狀態變動後自動重繪，不需要手動呼叫', async () => {
    const render = vi.fn();
    views.registerView(view('a', ['records'], render));
    views.connectStore();

    store.set('records', [{ id: 'r1' }]);
    await Promise.resolve(); // 等待微任務中的合併重繪
    expect(render).toHaveBeenCalledOnce();
  });

  it('同一輪的多個變動只重繪一次', async () => {
    const render = vi.fn();
    views.registerView(view('a', ['records', 'trips', 'settings'], render));
    views.connectStore();

    store.set('records', []);
    store.set('trips', []);
    store.set('settings', {});
    await Promise.resolve();
    expect(render).toHaveBeenCalledOnce();
  });

  it('就地修改後呼叫 touch 也會觸發重繪', async () => {
    const render = vi.fn();
    views.registerView(view('a', ['records'], render));
    views.connectStore();

    store.get('records').push({ id: 'x' });
    await Promise.resolve();
    expect(render).not.toHaveBeenCalled();

    store.touch('records');
    await Promise.resolve();
    expect(render).toHaveBeenCalledOnce();
  });

  it('取消訂閱後不再自動重繪', async () => {
    const render = vi.fn();
    views.registerView(view('a', ['records'], render));
    const off = views.connectStore();
    off();

    store.set('records', []);
    await Promise.resolve();
    expect(render).not.toHaveBeenCalled();
  });
});
