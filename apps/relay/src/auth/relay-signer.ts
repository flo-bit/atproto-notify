// Relay-as-issuer. Mints service-auth JWTs signed by the RELAY's own P-256 key
// (whose public half is published in the relay's did:web document, see
// well-known.ts). Used for OUTBOUND calls the relay makes to apps — e.g. the
// `subscriberChanged` callback (ENABLE-FROM-WEB.md). Mirrors the example-sender's
// sender-auth.ts. Until this, the relay only ever verified inbound JWTs.
import { P256PrivateKey, parsePrivateMultikey } from '@atcute/crypto';
import type { Did, Nsid } from '@atcute/lexicons';
import type { AtprotoAudience } from '@atcute/lexicons/syntax';
import { createServiceJwt } from '@atcute/xrpc-server/auth';

import type { Env } from '../env';

// Load + cache the keypair once per isolate, keyed on the secret value so a
// rotated key (new Env) re-imports.
let cached: { secret: string; keypair: Promise<P256PrivateKey> } | null = null;

function getKeypair(env: Env): Promise<P256PrivateKey> {
  if (!env.RELAY_PRIVATE_KEY) {
    throw new Error('RELAY_PRIVATE_KEY is not set (run `pnpm --filter @atmo/notifs-relay relay:keygen`)');
  }
  if (cached === null || cached.secret !== env.RELAY_PRIVATE_KEY) {
    const secret = env.RELAY_PRIVATE_KEY;
    cached = {
      secret,
      keypair: (async () => {
        const { privateKeyBytes } = parsePrivateMultikey(secret);
        return P256PrivateKey.importRaw(privateKeyBytes);
      })(),
    };
  }
  return cached.keypair;
}

/** Mint a short-lived service-auth JWT issued by the relay, addressed to `aud`. */
export async function mintRelayJwt(
  env: Env,
  aud: Did | AtprotoAudience,
  lxm: Nsid,
): Promise<string> {
  const keypair = await getKeypair(env);
  return createServiceJwt({
    keypair,
    issuer: env.RELAY_DID as Did,
    audience: aud,
    lxm,
    expiresIn: 60,
  });
}
