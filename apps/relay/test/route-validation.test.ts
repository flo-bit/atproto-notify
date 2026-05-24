import { isAppRoute, isCategoryRoute, isConcreteRoute } from '@atmo/notifs-lexicons';
import { expect, it } from 'vitest';

import { newTargetId } from '../src/lib/ids';

it('accepts channel sets, off, and inbox', () => {
  for (const r of ['push', 'push+telegram', 'email+dm+webhook', 'off', 'inbox']) {
    expect(isConcreteRoute(r)).toBe(true);
  }
});

it('accepts instance-scoped tokens whose ids use nanoid chars (incl. _ and -)', () => {
  // Regression: target ids are nanoids (A–Z a–z 0–9 _ -). The validator used to
  // reject ids containing _ or -, silently dropping per-instance routes.
  expect(isConcreteRoute('dm:qvHICr-uJhd5')).toBe(true);
  expect(isConcreteRoute('push:abc_DE-12')).toBe(true);
  expect(isConcreteRoute('push:a1b2c3+telegram')).toBe(true);

  // Any freshly-generated target id must validate as an instance token.
  for (let i = 0; i < 50; i++) {
    expect(isConcreteRoute(`push:${newTargetId()}`)).toBe(true);
  }
});

it('rejects malformed routes and the inherit sentinels', () => {
  expect(isConcreteRoute('default')).toBe(false);
  expect(isConcreteRoute('app')).toBe(false);
  expect(isConcreteRoute('push+push')).toBe(false); // duplicate token
  expect(isConcreteRoute('push:bad/id')).toBe(false); // illegal id char
});

it('app/category routes also accept their inherit sentinel', () => {
  expect(isAppRoute('default')).toBe(true);
  expect(isAppRoute('dm:qvHICr-uJhd5')).toBe(true);
  expect(isCategoryRoute('app')).toBe(true);
  expect(isCategoryRoute('dm:qvHICr-uJhd5')).toBe(true);
});
