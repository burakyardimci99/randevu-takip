import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10_000,
    pool: 'forks',
    fileParallelism: false, // SQLite shared DB için sequential
  },
});
