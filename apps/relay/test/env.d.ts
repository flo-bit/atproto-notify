import type { D1Migration } from '@cloudflare/vitest-pool-workers';

import type { Env } from '../src/env.ts';

// Augments the `cloudflare:test` module's `env` with our bindings plus the
// migrations array injected by vitest.config.ts.
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
