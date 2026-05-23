import type { Did, Nsid } from '@atcute/lexicons';

import type { Env } from '../env';
import { getVerifier } from './verifier';

/**
 * Cross-app login (`pub.atmo.auth`).
 *
 * Another atproto app mints a short-lived service-auth JWT on the *user's* PDS
 * (`iss` = user, `aud` = this relay's DID, `lxm` = `pub.atmo.auth`) and links the
 * user to atmo.pub's `/applogin?token=…`. The web app hands the token here over
 * the private `RelayRpc` binding; we verify it and return the issuer DID, which
 * the web app turns into a session. This is an *identity* proof only — it grants
 * no access to the user's PDS. See CROSS-APP-AUTH.md.
 *
 * It is a binding method (not public XRPC) because only atmo.pub's server
 * consumes these tokens; third parties only mint them. The public XRPC surface
 * stays locked to `requestPermission` + `send`.
 */
export const APPLOGIN_LXM = 'pub.atmo.auth' as Nsid;

/**
 * Single-use replay-guard TTL. Must cover the verifier's `maxAge` (300s) so a
 * token can never be reused inside its own validity window.
 */
const REPLAY_TTL_SECONDS = 300;

/** Thrown for any reason a token is not a usable login proof. */
export class AppLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppLoginError';
  }
}

/**
 * Verify a `pub.atmo.auth` service-auth token and return the issuer DID. Single
 * use: a token is rejected if it has already been consumed (keyed on a hash of
 * the whole token rather than `jti`, so it works whether or not the PDS emits a
 * unique nonce — the shared verifier has no `replayStore`, which keeps
 * non-`jti` `requestPermission` tokens working).
 */
export async function verifyAppLoginToken(env: Env, token: string): Promise<{ did: Did }> {
  if (typeof token !== 'string' || token.length === 0) {
    throw new AppLoginError('Missing token');
  }

  const replayKey = `applogin:${await sha256Base64Url(token)}`;
  if ((await env.CACHE.get(replayKey)) !== null) {
    throw new AppLoginError('Token already used');
  }

  // The verifier reads the bearer token from an Authorization header, so wrap it
  // in a synthetic Request. `lxm` + the relay-DID audiences are checked here.
  const req = new Request('https://relay.atmo.pub/applogin', {
    headers: { authorization: `Bearer ${token}` },
  });
  let issuer: Did;
  try {
    ({ issuer } = await getVerifier(env).verifyRequest(req, { lxm: APPLOGIN_LXM }));
  } catch (err) {
    throw new AppLoginError(err instanceof Error ? err.message : 'Invalid token');
  }

  // Burn it so it can't be replayed within its validity window.
  await env.CACHE.put(replayKey, '1', { expirationTtl: REPLAY_TTL_SECONDS });

  return { did: issuer };
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  let binary = '';
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
