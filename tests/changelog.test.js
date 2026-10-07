/**
 * 版本與更新紀錄的一致性。
 * 設定頁顯示的版本來自 CHANGELOG，若 package.json 沒同步，使用者看到的版本就是錯的。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHANGELOG, APP_VERSION, APP_UPDATED } from '../src/domain/changelog.js';
import { bootLegacyApi } from './harness.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const semver = (v) => v.split('.').map(Number);
const cmp = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

describe('更新紀錄', () => {
  it('package.json 的版本號等於最新一筆紀錄（發版時兩邊要一起改）', () => {
    expect(pkg.version).toBe(APP_VERSION);
    expect(APP_UPDATED).toBe(CHANGELOG[0].date);
  });

  it('每筆都有合法版本號、日期與至少一個項目', () => {
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.items.length).toBeGreaterThan(0);
    }
  });

  it('版本號嚴格遞減、日期不會倒退（最新的在最前面）', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(cmp(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
  });
});

describe('設定頁', () => {
  const boot = () => bootLegacyApi({ storage: { 'ledger.v23.seeded': '1' } });

  it('顯示目前版本、最近更新日期與項目', () => {
    const { api, close } = boot();
    const doc = api.document;
    expect(doc.querySelector('#versionSummary').textContent).toContain(`v${APP_VERSION}`);
    const text = doc.querySelector('#versionBody').textContent;
    expect(text).toContain(APP_UPDATED);
    expect(text).toContain(CHANGELOG[0].items[0]);
    close();
  });

  it('所有設定區塊預設都是收合的', () => {
    const { api, close } = boot();
    const open = [...api.document.querySelectorAll('#view-settings details.setgroup')].filter(
      (d) => d.open,
    );
    expect(open).toEqual([]);
    close();
  });
});
