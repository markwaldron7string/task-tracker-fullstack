import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    teardownTimeout: 5_000,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
