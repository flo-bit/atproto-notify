import type { Did, Nsid } from '@atcute/lexicons';
import type { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';

/**
 * Sender path (used by `requestPermission`, `send`).
 *
 * The bearer JWT is issued by the *sender's* DID and signed with the sender's
 * atproto signing key (resolved from their DID document). On any failure the
 * verifier throws `AuthRequiredError` with a populated `WWW-Authenticate`.
 */
export async function verifySenderRequest(
  verifier: ServiceJwtVerifier,
  request: Request,
  lxm: Nsid,
): Promise<{ senderDid: Did }> {
  const { issuer } = await verifier.verifyRequest(request, { lxm });
  return { senderDid: issuer };
}

/**
 * Verify a *second*, body-carried service-auth JWT — used by the dual-auth
 * routing methods to prove the user's consent alongside the app's own bearer
 * token. The verifier only inspects the `Authorization` header, so we wrap the
 * raw token in a synthetic request; the URL/method are irrelevant to JWT
 * verification while the same audience/lxm/expiry checks still apply.
 */
export async function verifyServiceToken(
  verifier: ServiceJwtVerifier,
  token: string,
  lxm: Nsid,
): Promise<{ did: Did }> {
  const synthetic = new Request('https://relay.invalid/', {
    headers: { authorization: `Bearer ${token}` },
  });
  const { issuer } = await verifier.verifyRequest(synthetic, { lxm });
  return { did: issuer };
}
