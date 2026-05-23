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
