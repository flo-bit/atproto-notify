# Enable apps from inside atmo.pub (relay-signed callback) — spec

Let a user turn on notifications for a (hardcoded, for now) third-party app from
inside atmo.pub, with no trip through that app's own login. The app finds out via
a **relay-signed callback** — the relay vouches for the opt-in, which the app
already trusts since it sends everything through the relay. Companion to
`CROSS-APP-AUTH.md`; this is the *outbound* direction.

## Why this shape

`send` is gated solely by a grant (`send.ts:29`), and atmo.pub can create grants
for any signed-in user over the `RELAY` binding (works for **lite-session** users
too — it's just a DID). So "enable App X" decomposes into:

1. **Create the grant** — already possible via `ops.grant`.
2. **Tell App X** — the new part.

For #2 we make the **relay a JWT issuer**: on grant create/revoke it mints a
service-auth JWT (`iss = did:web:relay.atmo.pub`) addressed to App X and POSTs a
`subscriberChanged` event. App X verifies the relay's signature exactly like it
verifies any service-auth, confirms `iss` is the relay, and updates its
subscriber list. No polling, no web-side service-auth, no shared secrets, works
for lite sessions.

```
atmo.pub  ── user toggles "Enable App X" ──▶ RELAY binding ops.grant(user, {sender: X})
                                                   │  upsert grant
                                                   │  enqueue { kind:'subscriberChanged', sender:X, recipient:user, enabled:true }
                                                   ▼
relay queue/dispatcher ── mint relay JWT (iss=did:web:relay.atmo.pub, aud=X,
                          lxm=pub.atmo.notify.subscriberChanged) ──▶ POST X/xrpc/…subscriberChanged
                                                   ▼
App X  ── verify sig + aud=self + lxm + iss==relayDID ──▶ record subscriber ──▶ send() from now on
```

## Trust & its one tradeoff

App X trusts the relay's *assertion* of consent, not a fresh user-PDS signature.
That's the **same** trust App X already places in the relay (it gates and
delivers all of App X's notifications) and the same trust atmo.pub's binding-based
management runs on. Reach for a user-JWT instead only if an app does something
privileged on opt-in (provisions an account, links identity) — not this case.

Replay is a non-issue: the callback sets a **state** (`enabled: true|false`), not
an increment, so it's idempotent — no `jti`/single-use needed.

## The relay becomes an issuer (the one real prerequisite)

Today the relay only verifies (`well-known.ts:26`, DID doc has no
`verificationMethod`). Mirror exactly what `apps/example-sender` already does as a
sender:

- **`scripts/generate-relay-key.js`** (copy of the sender's `generate-keys.js`) →
  prints a P-256 private+public multikey. Add `"relay:keygen"` to relay scripts.
- **`RELAY_PRIVATE_KEY`** secret (multikey); add `RELAY_PRIVATE_KEY: string` to
  `Env` (env.ts) and to `.dev.vars` for tests.
- **`src/auth/relay-signer.ts`** (copy of `sender-auth.ts`): cache the keypair,
  `mintRelayJwt(env, aud, lxm)` via `createServiceJwt({ keypair, issuer:
  env.RELAY_DID, audience: aud, lxm, expiresIn: 60 })`.
- **`handleWellKnownDid`** (well-known.ts): add the public key as a
  `verificationMethod` (`id: '#atproto'`, `type: 'Multikey'`, controller =
  RELAY_DID). App X resolves this via `did:web` to verify.

## The app registry (single source for trusted + catalog + callback)

Replace `src/lib/trusted.ts` with `src/lib/apps.ts`:

```ts
export interface RegisteredApp {
  did: Did;
  title: string;
  description?: string;
  iconUrl?: string;
  /** Where the relay POSTs subscriber callbacks. Omit → no callback for this app. */
  callbackUrl?: string;       // e.g. 'https://example.atmo.pub'  (→ /xrpc/… appended)
  /** Auto-grant at requestPermission (the old TRUSTED_SENDERS behaviour). */
  trusted?: boolean;
}
export const APPS: readonly RegisteredApp[] = [/* … */];

export const isTrustedSender   = (did: Did) => APPS.some(a => a.did === did && a.trusted);
export const callbackAppFor    = (did: Did) => APPS.find(a => a.did === did && a.callbackUrl);
export const appCatalog        = () => APPS.map(({ did, title, description, iconUrl }) =>
                                         ({ did, title, description, iconUrl }));
```

(`requestPermission.ts` already imports `isTrustedSender` — unchanged.)
For v1 the `callbackUrl` is hardcoded; later it could be resolved from App X's
DID-doc `serviceEndpoint` so only the DID is config.

## The callback contract

New **published** lexicon `packages/lexicons/lexicons/pub/atmo/notify/subscriberChanged.json`
(a procedure App X implements; served via `well-known.ts` like send/requestPermission):

```jsonc
{
  "lexicon": 1,
  "id": "pub.atmo.notify.subscriberChanged",
  "defs": { "main": {
    "type": "procedure",
    "description": "Relay-authenticated. The relay tells an app that a user's notification subscription to it changed (enabled/disabled). iss is the relay DID.",
    "input": { "encoding": "application/json", "schema": {
      "type": "object",
      "required": ["recipient", "enabled"],
      "properties": {
        "recipient": { "type": "string", "format": "did" },
        "enabled":   { "type": "boolean" },
        "changedAt": { "type": "string", "format": "datetime",
                       "description": "When the grant changed; lets the app resolve out-of-order callbacks." }
      }
    }},
    "output": { "encoding": "application/json", "schema": {
      "type": "object", "properties": { "ok": { "type": "boolean" } } } }
  }}
}
```

Run `pnpm --filter @atmo/notifs-lexicons generate` after adding it; add it to the
`LEXICONS` map in `well-known.ts`.

## Changes by package

### `apps/relay`
- `src/lib/apps.ts` (replaces `trusted.ts`, above).
- `src/auth/relay-signer.ts` + `scripts/generate-relay-key.js` + `RELAY_PRIVATE_KEY`
  in `Env`; `verificationMethod` in `handleWellKnownDid`.
- `src/env.ts` `DispatchJob` += variant (note: **no `channel`** field, unlike the
  others):
  ```ts
  | { kind: 'subscriberChanged'; sender: string; recipient: string;
      enabled: boolean; changedAt: string }
  ```
- `src/delivery/dispatcher.ts`:
  - `dispatch()`: `if (job.kind === 'subscriberChanged') return sendSubscriberCallback(env, job);`
  - `reapIfDead()`: guard `job.kind` first (it dereferences `job.channel`).
    Treat a `4xx` from the app as permanent (ack/drop); everything else retries
    via Queues.
  - `sendSubscriberCallback`: look up `callbackAppFor(job.sender)`; `mintRelayJwt(env,
    job.sender, 'pub.atmo.notify.subscriberChanged')`; `POST ${callbackUrl}/xrpc/pub.atmo.notify.subscriberChanged`
    with `Authorization: Bearer …` and body `{ recipient, enabled, changedAt }`;
    throw on non-2xx.
- `src/rpc/ops.ts`: in `grant` (after upsert) and `revoke` (only when `revoked`),
  if `callbackAppFor(input.sender)`, `await env.DISPATCH_QUEUE.send({ kind:
  'subscriberChanged', … enabled })`. Add binding op `listApps()` → `appCatalog()`.
  *(Optional: also fire from the requestPermission auto-allow + Telegram approve
  paths for completeness; not required since those apps already know the user.)*
- `src/rpc/entrypoint.ts` + `packages/lexicons/src/rpc.ts`: add
  `listApps(): Promise<AppInfo[]>` to `NotifsRpc` (+ an `AppInfo` interface:
  `{ did; title; description?; iconUrl? }`). Second binding method with no leading
  `did` (catalog is static), alongside `verifyAppLogin`.
- `test/subscriberChanged.test.ts`: grant→queues a job for a registered app (and
  *not* for an unregistered one); dispatcher mints a relay JWT and POSTs the
  expected bearer + body (mock fetch); revoke→`enabled:false`.

### `apps/web`
- `src/lib/server/relay.ts` `relayFor`: expose `listApps: () => svc.listApps()`.
- An **"Apps you can enable"** view (on the Apps screen, or a Discover tab):
  render `listApps()` × `listGrants()` → a toggle per app. On → existing `grant({
  sender })`; off → existing `revoke({ sender })`. Works for lite + OAuth sessions.

### `apps/example-sender` (reference receiver)
- **Inbound endpoint** `src/routes/xrpc/[method]/+server.ts` handling
  `pub.atmo.notify.subscriberChanged`:
  - Verify with a `ServiceJwtVerifier` (`acceptAudiences: [SENDER_DID]`, web+plc
    resolver, `lxm: 'pub.atmo.notify.subscriberChanged'`).
  - **Assert `issuer === RELAY_DID`** — accept callbacks *only* from the relay.
  - Record `{ recipient, enabled }` (the demo can store in KV / log; a real app
    persists it and starts/stops sending).
- No new OAuth scope (this is inbound, app-key-verified — not user OAuth).

## Security recap (carry to docs)
- App X must verify **iss == relay DID** in addition to sig/aud/lxm — otherwise
  anyone could mint an aud=AppX token. This is the critical check.
- Idempotent state callbacks → safe to retry; no replay store needed. Include
  `changedAt` so rapid on/off/on toggles can be ordered by the receiver.
- Relay key compromise = an attacker can forge enrollments — bounded, since a
  compromised relay already controls all grants/data. Rotate via the DID doc.
- Delivery is best-effort with Queue retries; for a hard guarantee add a pull
  reconcile method (`listGrantedRecipients`, app-DID-authed) later so apps can
  catch missed callbacks. Out of scope for v1.

## Build checklist — DONE
- [x] relay: keypair (`relay:keygen` + `RELAY_PRIVATE_KEY` + Env), `relay-signer.ts`, did.json key
- [x] lexicon `subscriberChanged.json` + generated + served in well-known
- [x] `apps.ts` registry (replaced trusted.ts); `listApps` on binding + contract
- [x] `DispatchJob` variant + dispatcher `sendSubscriberCallback` + reap guard (4xx drop / 5xx retry)
- [x] `ops.grant`/`ops.revoke` enqueue callback for registered apps
- [x] web: `listApps` in relayFor + "Apps you can enable" UI (Enable = grant)
- [x] example-sender: inbound `routes/xrpc/[method]` verify-and-record endpoint (asserts iss==relay) + page list
- [x] tests (`test/subscriberChanged.test.ts`, relay 60); monorepo `pnpm -r build` green

**Before prod:** run `relay:keygen`, set the `RELAY_PRIVATE_KEY` secret, paste the
public multikey into `well-known.ts` (a dev key is committed there now), and set
each app's real `callbackUrl` in `apps.ts`.
```
