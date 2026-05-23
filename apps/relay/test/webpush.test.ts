import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import {
  b64urlDecode,
  b64urlEncode,
  concatBytes,
  ecdhSharedSecret,
  hkdf,
  utf8,
} from '../src/delivery/push-crypto';
import { encryptPayload, vapidAuthHeader } from '../src/delivery/webpush';
import * as ops from '../src/rpc/ops';

it('encryptPayload produces a body the subscription keypair can decrypt (RFC 8291 round-trip)', async () => {
  // The "user agent" ECDH keypair stands in for the browser's subscription keys.
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  const original = JSON.stringify({ title: 'Hi', body: 'there', uri: 'https://x.example' });
  const body = await encryptPayload(uaPublic, authSecret, utf8(original));

  // Parse the aes128gcm header: salt(16) | rs(4) | idlen(1) | as_public(idlen) | ciphertext.
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  expect(idlen).toBe(65);

  // Re-derive the key schedule from the UA side and decrypt.
  const ecdh = await ecdhSharedSecret(ua.privateKey, asPublic);
  const ikm = await hkdf(
    authSecret,
    ecdh,
    concatBytes(utf8('WebPush: info\0'), uaPublic, asPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, ciphertext),
  );

  expect(padded[padded.length - 1]).toBe(0x02); // last-record delimiter
  expect(new TextDecoder().decode(padded.slice(0, -1))).toBe(original);
});

it('vapidAuthHeader signs a verifiable ES256 JWT with the right aud/sub', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const publicKey = b64urlEncode(rawPublic);

  const header = await vapidAuthHeader(
    'https://fcm.googleapis.com/fcm/send/abc',
    privateJwk,
    publicKey,
    'mailto:t@example.com',
  );

  const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  expect(match).not.toBeNull();
  const [, jwt, k] = match!;
  expect(k).toBe(publicKey);

  const [h64, p64, s64] = jwt!.split('.');
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p64!))) as Record<string, unknown>;
  expect(payload.aud).toBe('https://fcm.googleapis.com');
  expect(payload.sub).toBe('mailto:t@example.com');
  expect(typeof payload.exp).toBe('number');

  const verifyKey = await crypto.subtle.importKey(
    'raw',
    rawPublic,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifyKey,
    b64urlDecode(s64!),
    utf8(`${h64}.${p64}`),
  );
  expect(ok).toBe(true);
});

it('registerWebPush stores a subscription; unregisterWebPush removes it (scoped to the user)', async () => {
  const did = 'did:plc:pushuser' as Did;
  const sub = { endpoint: 'https://push.example/abc', p256dh: 'fakePub', auth: 'fakeAuth' };

  expect(await ops.registerWebPush(env, did, sub)).toEqual({ registered: true });
  let rows = await q.listPushSubscriptionsForDid(env.DB, did);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.endpoint).toBe(sub.endpoint);

  // Another user can't drop it.
  expect(await ops.unregisterWebPush(env, 'did:plc:other' as Did, sub.endpoint)).toEqual({
    unregistered: false,
  });
  expect(await q.listPushSubscriptionsForDid(env.DB, did)).toHaveLength(1);

  // The owner can.
  expect(await ops.unregisterWebPush(env, did, sub.endpoint)).toEqual({ unregistered: true });
  rows = await q.listPushSubscriptionsForDid(env.DB, did);
  expect(rows).toHaveLength(0);
});
