import { applyD1Migrations, env } from 'cloudflare:test';

// Runs once per test file (before the per-test storage isolation snapshot), so
// every test sees a fully-migrated, empty database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
