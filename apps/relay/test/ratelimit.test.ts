import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';

import { checkAndIncrement } from '../src/ratelimit';

it('allows requests under the limit and denies those over it', async () => {
  const key = 'rl:test:underover';

  const first = await checkAndIncrement(env.CACHE, key, 2, 60);
  expect(first.allowed).toBe(true);
  expect(first.remaining).toBe(1);

  const second = await checkAndIncrement(env.CACHE, key, 2, 60);
  expect(second.allowed).toBe(true);
  expect(second.remaining).toBe(0);

  const third = await checkAndIncrement(env.CACHE, key, 2, 60);
  expect(third.allowed).toBe(false);
  expect(third.remaining).toBe(0);
});

it('resets once the logical window has elapsed', async () => {
  vi.useFakeTimers();
  try {
    const t0 = Date.now();
    vi.setSystemTime(t0);
    const key = 'rl:test:reset';

    expect((await checkAndIncrement(env.CACHE, key, 1, 60)).allowed).toBe(true);
    expect((await checkAndIncrement(env.CACHE, key, 1, 60)).allowed).toBe(false);

    // Advance past the window end; the counter should reset.
    vi.setSystemTime(t0 + 61_000);
    expect((await checkAndIncrement(env.CACHE, key, 1, 60)).allowed).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
