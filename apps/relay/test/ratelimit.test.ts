import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';

import { checkAndIncrement, checkAndIncrementAll } from '../src/ratelimit';

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

it('checkAndIncrementAll: empty checks are allowed', async () => {
  expect((await checkAndIncrementAll(env.CACHE, [])).allowed).toBe(true);
});

it('checkAndIncrementAll allows up to the limit on a single key', async () => {
  const checks = [{ key: 'rl:test:all:single', limit: 2, windowSeconds: 60 }];
  expect((await checkAndIncrementAll(env.CACHE, checks)).allowed).toBe(true);
  expect((await checkAndIncrementAll(env.CACHE, checks)).allowed).toBe(true);
  expect((await checkAndIncrementAll(env.CACHE, checks)).allowed).toBe(false);
});

it('checkAndIncrementAll denies when ANY key is over — without consuming the others', async () => {
  const a = 'rl:test:all:a';
  const b = 'rl:test:all:b';
  const checks = [
    { key: a, limit: 1, windowSeconds: 60 },
    { key: b, limit: 5, windowSeconds: 60 },
  ];

  // First call: both under → allowed, both incremented (a=1, b=1).
  expect((await checkAndIncrementAll(env.CACHE, checks)).allowed).toBe(true);
  // Second: a is now at its limit → denied, and b must NOT be incremented.
  expect((await checkAndIncrementAll(env.CACHE, checks)).allowed).toBe(false);

  // Prove b is still at 1 (not 2): exactly 4 more single-key increments fit under 5.
  for (let i = 0; i < 4; i++) {
    expect((await checkAndIncrement(env.CACHE, b, 5, 60)).allowed).toBe(true);
  }
  expect((await checkAndIncrement(env.CACHE, b, 5, 60)).allowed).toBe(false);
});
