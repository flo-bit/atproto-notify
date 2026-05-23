import { fileURLToPath } from 'node:url';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // The Workers pool is wired as a Vite plugin (vitest 4 / pool-workers 0.16).
    // The callback receives the same config the old `poolOptions.workers` took.
    cloudflareTest(async () => {
      const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));
      const migrations = await readD1Migrations(migrationsDir);
      return {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            // Handed to the setup file to migrate the in-memory D1 before tests.
            TEST_MIGRATIONS: migrations,
            // Deterministic, non-secret values for tests.
            BOT_USERNAME: 'atmonotifsbot',
            TELEGRAM_BOT_TOKEN: 'test-bot-token',
            TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
