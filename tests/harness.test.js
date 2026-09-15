import { describe, it, expect } from 'vitest';
import { bootLegacyApp } from './harness.js';

describe('legacy harness', () => {
  it('boots index.html without throwing', () => {
    const { window, errors, close } = bootLegacyApp();
    try {
      expect(errors).toEqual([]);
      expect(typeof window.myShareOf).toBe('function');
      expect(typeof window.calculateDiscountPlan).toBe('function');
      expect(window.document.querySelector('#view-list')).not.toBeNull();
    } finally {
      close();
    }
  });
});
