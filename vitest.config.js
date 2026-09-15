import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // harness 自己建 jsdom，不用 vitest 的全域環境
    include: ['tests/**/*.test.js'],
    testTimeout: 20000,
  },
});
