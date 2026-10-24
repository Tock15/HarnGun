import { configDefaults, defineConfig } from 'vitest/config';

// `unit` runs anywhere; `integration` (*.int.test.ts) needs `docker compose -f docker-compose.dev.yml up`.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', exclude: [...configDefaults.exclude, '**/*.int.test.ts'] } },
      { test: { name: 'integration', include: ['**/*.int.test.ts'], fileParallelism: false, testTimeout: 30_000 } },
    ],
  },
});
