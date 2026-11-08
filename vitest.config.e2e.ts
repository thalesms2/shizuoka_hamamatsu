import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: '.env.test', override: true });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
