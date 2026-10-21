import { describe, it, expect } from 'vitest';
import { placeTypeToCategory, placeTypesToCategory } from '../../src/domain/place-category.js';

describe('placeTypesToCategory', () => {
  it('依序取第一個對得上的類型（主要類型最前面）', () => {
    expect(placeTypesToCategory(['supermarket', 'food', 'store'])).toBe('日用品');
    expect(placeTypesToCategory(['point_of_interest', 'cafe'])).toBe('餐食');
  });
  it('對不上或空值回傳空字串', () => {
    expect(placeTypesToCategory(['point_of_interest'])).toBe('');
    expect(placeTypesToCategory([])).toBe('');
    expect(placeTypeToCategory('')).toBe('');
  });
  it('接受單一字串', () => {
    expect(placeTypesToCategory('gas_station')).toBe('交通');
  });
});
