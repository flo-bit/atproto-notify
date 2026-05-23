// Generate a VAPID keypair for Web Push. Run: `pnpm vapid:keygen`.
//
// Prints three values:
//   VAPID_PUBLIC_KEY   — base64url uncompressed point. Goes in the relay's
//                        wrangler.toml [vars] AND the web app's VAPID_PUBLIC_KEY
//                        config (it's the browser's applicationServerKey; public).
//   VAPID_PRIVATE_JWK  — the private signing key. Set as a relay SECRET:
//                        `wrangler secret put VAPID_PRIVATE_JWK` (never commit).
//   VAPID_SUBJECT      — a mailto: or https: contact URL (edit before use).
import { webcrypto as crypto } from 'node:crypto';

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

console.log('VAPID_PUBLIC_KEY=' + b64url(rawPublic));
console.log('VAPID_PRIVATE_JWK=' + JSON.stringify(privateJwk));
console.log('VAPID_SUBJECT=mailto:you@example.com');
