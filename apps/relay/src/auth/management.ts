// Authentication + authorization for notification *management* calls.
// See MANAGEMENT-AUTH.md for the full model. In short:
//   - The app is always authenticated by its own service-auth bearer (`iss`).
//   - The user is identified by a body `userToken` (dual-auth) OR, for an app
//     with a standing designation, a vouched body `did` (no user token).
//   - Authorization = the (user, app) capability (relay-wide or per-grant) plus
//     the relay's self-policy for the undesignated open end.
import type { Did, Nsid } from '@atcute/lexicons';

import * as q from '../db/queries';
import type { AppContext, Env } from '../env';
import { relayManageFor } from '../lib/apps';
import { notAuthorized } from '../lib/errors';

import { verifySenderRequest, verifyServiceToken } from './sender';

export type Capability = 'none' | 'self' | 'full';
export type SelfPolicy = 'off' | 'relay-allowlist' | 'user-allowlist' | 'open';

const RANK: Record<Capability, number> = { none: 0, self: 1, full: 2 };

function readPolicy(env: Env): SelfPolicy {
  return (env.MANAGEMENT_SELF_READ_POLICY as SelfPolicy | undefined) ?? 'open';
}
function writePolicy(env: Env): SelfPolicy {
  return (env.MANAGEMENT_SELF_WRITE_POLICY as SelfPolicy | undefined) ?? 'user-allowlist';
}

/**
 * The app's standing capability for a user = max(relay-wide designation,
 * per-grant designation). `granted` is true if a grant exists or the app is
 * relay-wide designated (relay managers don't need a per-user grant row).
 */
async function resolveCapability(
  env: Env,
  userDid: Did,
  appDid: Did,
): Promise<{ cap: Capability; granted: boolean }> {
  const relayCap = relayManageFor(appDid);
  const grant = await q.getGrant(env.DB, userDid, appDid);
  const grantCap = (grant?.manage as Capability | undefined) ?? 'none';
  const cap = RANK[relayCap ?? 'none'] >= RANK[grantCap] ? (relayCap ?? 'none') : grantCap;
  return { cap, granted: grant !== null || relayCap !== undefined };
}

export interface ManagementNeed {
  scope: 'self' | 'full';
  write: boolean;
  lxm: string;
}

export interface ManagementCall {
  appDid: Did;
  userDid: Did;
}

/**
 * Verify + authorize a management call, returning the authenticated app DID and
 * the resolved user DID. Throws `NotAuthorized` (403) on any failure.
 */
export async function verifyManagementCall(
  app: AppContext,
  request: Request,
  input: { userToken?: string; did?: string },
  need: ManagementNeed,
): Promise<ManagementCall> {
  const lxm = need.lxm as Nsid;
  const { senderDid: appDid } = await verifySenderRequest(app.verifier, request, lxm);

  // User identity: dual-auth (a user token) or vouch (a body DID, designation-gated).
  let userDid: Did;
  let vouched: boolean;
  if (input.userToken !== undefined) {
    ({ did: userDid } = await verifyServiceToken(app.verifier, input.userToken, lxm));
    vouched = false;
  } else if (input.did !== undefined) {
    userDid = input.did as Did;
    vouched = true;
  } else {
    throw notAuthorized();
  }
  if (userDid === appDid) throw notAuthorized();

  const { cap, granted } = await resolveCapability(app.env, userDid, appDid);
  if (!granted) throw notAuthorized();

  const designated = (scope: 'self' | 'full') => RANK[cap] >= RANK[scope];

  if (need.scope === 'full') {
    // Whole-account always needs a manager designation; vouch or dual both fine.
    if (!designated('full')) throw notAuthorized();
    return { appDid, userDid };
  }

  // self scope
  if (designated('self')) return { appDid, userDid }; // designated → vouch or dual ok

  // Undesignated self: vouch is not allowed (no standing consent), and the
  // relay's open-end policy must admit it.
  if (vouched) throw notAuthorized();
  const policy = need.write ? writePolicy(app.env) : readPolicy(app.env);
  if (policy !== 'open') throw notAuthorized(); // relay/user allowlists are covered by `designated`
  return { appDid, userDid };
}
