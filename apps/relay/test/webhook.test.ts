import { afterEach, expect, it } from 'vitest';

import { sendWebhook, WebhookError } from '../src/delivery/webhook';

const channel = { platform: 'webhook' as const, url: 'https://hook.example/x' };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

it('POSTs a JSON envelope and resolves on 2xx', async () => {
  let captured: Request | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = new Request(input as RequestInfo, init);
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  await sendWebhook(channel, {
    title: 'Hi',
    body: 'There',
    uri: 'https://x.example/post',
    sender: 'did:plc:abc',
  });

  expect(captured).toBeDefined();
  expect(captured!.method).toBe('POST');
  expect(captured!.url).toBe('https://hook.example/x');
  expect(captured!.headers.get('content-type')).toContain('application/json');
  const body = (await captured!.json()) as Record<string, unknown>;
  expect(body).toMatchObject({
    title: 'Hi',
    body: 'There',
    uri: 'https://x.example/post',
    sender: 'did:plc:abc',
  });
  expect(typeof body.sentAt).toBe('string');
});

it('omits uri when absent', async () => {
  let captured: Request | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = new Request(input as RequestInfo, init);
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  await sendWebhook(channel, { title: 'a', body: 'b', sender: 'did:plc:x' });

  const body = (await captured!.json()) as Record<string, unknown>;
  expect('uri' in body).toBe(false);
});

it('throws WebhookError on a non-2xx response', async () => {
  globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch;
  await expect(
    sendWebhook(channel, { title: 'a', body: 'b', sender: 'did:plc:x' }),
  ).rejects.toBeInstanceOf(WebhookError);
});

it('surfaces the status code on WebhookError (so the dispatcher can reap 4xx)', async () => {
  globalThis.fetch = (async () => new Response('', { status: 410 })) as typeof fetch;
  await expect(
    sendWebhook(channel, { title: 'a', body: 'b', sender: 'did:plc:x' }),
  ).rejects.toMatchObject({ statusCode: 410 });
});
