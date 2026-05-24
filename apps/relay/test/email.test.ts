import { env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';

import { EmailError, sendEmail } from '../src/delivery/email';

import { installFetchMock, mockComailError, mockComailOk, mockComailRejected } from './helpers';

// Reset routes before each test — all comail mocks match the same host, so the
// first-registered would otherwise win across tests.
beforeEach(() => {
  installFetchMock();
});

const msg = { to: 'user@example.com', subject: 'Hello', text: 'Sent via comail' };

it('sends an email and returns the comail message id', async () => {
  mockComailOk(448);
  const { messageId } = await sendEmail(env, msg);
  expect(messageId).toBe(448);
});

it('throws EmailError on a comail error response', async () => {
  mockComailError(429, 'RATE_LIMITED');
  await expect(sendEmail(env, msg)).rejects.toBeInstanceOf(EmailError);
});

it('throws EmailError when the recipient is rejected (2xx, empty accepted)', async () => {
  mockComailRejected();
  await expect(sendEmail(env, msg)).rejects.toBeInstanceOf(EmailError);
});
