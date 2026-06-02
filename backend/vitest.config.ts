import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 15_000,
    pool: 'forks',
    fileParallelism: false, // tek pg test DB paylaşıldığından sequential
    globalSetup: ['./tests/global-setup.ts'], // run başında pg şema sıfırlama
  },
});
