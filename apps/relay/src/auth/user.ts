import type { Did, Nsid } from '@atcute/lexicons';
import type { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';

/**
 * User path (used by every procedure/query except `requestPermission`/`send`).
 *
 * The bearer JWT is issued by the *end user's* DID, minted by their PDS via
 * `com.atproto.server.getServiceAuth` (the website obtains these on the user's
 * behalf). On any failure the verifier throws `AuthRequiredError` with a
 * populated `WWW-Authenticate`.
 */
export async function verifyUserRequest(
  verifier: ServiceJwtVerifier,
  request: Request,
  lxm: Nsid,
): Promise<{ userDid: Did }> {
  const { issuer } = await verifier.verifyRequest(request, { lxm });
  return { userDid: issuer };
}
