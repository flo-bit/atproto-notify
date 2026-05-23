# Notification management auth — spec

How an app (first-party *or* third-party) reads and changes a user's notification
configuration on a relay. Companion to `CROSS-APP-AUTH.md` (inbound user login)
and `ENABLE-FROM-WEB.md` (outbound subscriber callbacks).

## Scope — what this is and isn't

**Out of scope (unchanged, deliberately open):** `requestPermission` and `send`.
Any atproto app can ask a user for permission and, once granted, send. That
federated layer is gated only by the per-(user, sender) **grant**. Nothing here
changes it.

**In scope:** everything `apps/web` (atmo.pub) does today over the Cloudflare
**service binding** — read/modify a user's grants, pending requests, channels,
devices, routing, account defaults, inbox. Two pressures force this off the
binding:

1. A relay's management UI (atmo.pub's `web/`, or an app's own dashboard) may not
   run on Cloudflare, so it can't use a service binding.
2. We want **third-party dashboards** — alternative clients that manage a user's
   whole notification account, opted into by the user.

The relay itself can stay Cloudflare-only for now; the binding remains as a
fast path. This spec adds a **portable, app-authenticated XRPC surface** beside
it, both delegating to the same `apps/relay/src/rpc/ops.ts`.

## Two facts that constrain everything

1. **A user service-auth JWT carries no app identity.** `com.atproto.server.getServiceAuth`
   mints `{ iss = user DID, aud, lxm, exp, jti }` — there is no `client_id`. The
   relay's verifier surfaces exactly `{ issuer, audience, lxm }`. So you **cannot**
   tell *which app* asked from a user token; to authenticate an app you need a
   credential the app controls (its own DID-signed service-auth — standard atproto
   inter-service auth, `iss = app DID`).
2. **A service-auth token consents to a *method*, not its *parameters*.** A user
   token for `lxm = …revoke` says "the user authorized *a* revoke," not "revoke
   app Y." An untrusted intermediary could retarget it. This is *the* reason
   whole-account power can't rest on per-call user tokens alone.

## The model

Two orthogonal axes.

### Axis 1 — authorization: what may the caller touch?

A capability per `(user, app)`:

- **`send`** — base grant only (the open federated layer). No management.
- **`self`** — *only this app's own slice*: its routing, its inbox, its app-wide
  route (the dual-auth federated methods that already exist). **Read and write
  split here:** *reading* the own slice (`getRouting`-self, `listNotifications`-self)
  is open to any granted app by default — it's their own relationship data —
  while *writing* (`setRouting`, `setAppRouting`, `markRead`, `revokeSelf`,
  `muteSelf`) needs admission via the self-write policy below.
- **`full` (manager)** — whole account: all notifications, all apps, all channels,
  devices, account default, auto-allow, pending. Everything `web/` does. **No
  read/write split** — reading the full account exposes every channel (email,
  phone, telegram) and the complete app graph, which is as sensitive as writing,
  so there is no "read-only full" tier.

**Invariant (never toggleable): `self` is always own-slice.** Sender is taken
from the authenticated app token, never the request body. No policy, allowlist,
or flag may widen a `self` app beyond its own slice. The knobs below govern
*admission*, never *scope*.

### Axis 2 — authentication: how is the user established?

- **Vouch** — app token (`iss = app DID`) + the user DID in the body, **no user
  token**. The app asserts "I act for this user." Only honored when the app has a
  *standing designation* for that user (below) — the designation **is** the
  consent. Works for **lite sessions** (magic-link), since no user token is needed.
- **Dual-auth** — app token + a fresh user token (`iss = user DID`, same `lxm`).
  Proves live user presence per call. Needed when there's no standing designation.
  The user DID is taken from the user token's `iss` (never trusted from the body).
  **Cannot** ride a lite session (there's no token to present).
- **Binding** — the Cloudflare service binding is a transport-level vouch for the
  first-party relay UI. Equivalent trust to a relay-wide manager; kept as a fast
  path.

### The gate — who reaches `self` / `full`?

Designation comes from two places:

- **Relay-wide** (operator-controlled): a small allowlist of first-party apps that
  may vouch for *any* user. This is atmo.pub itself (the binding today).
- **Per-user** (user-controlled): the user designates "app Z may manage my
  notifications," at `self` or `full`. This is the per-grant capability.

And relay-level **policies** for the *open* end of `self` (granted apps with no
per-user designation, acting with dual-auth). Reads and writes are governed
separately; each takes `off | relay-allowlist | user-allowlist | open`:

- **`MANAGEMENT_SELF_READ_POLICY`** — default **`open`** (reading your own slice is
  low-risk; bounded by self-scope, a user token, and an existing grant).
- **`MANAGEMENT_SELF_WRITE_POLICY`** — default **`user-allowlist`** (writes can
  escalate routing, so opt-in). `off` disables undesignated self-writes; `open`
  allows any granted app with a user token.

A per-user `self`/`full` designation always satisfies both (a designated app may
read and write its slice, and may vouch). `full` is **always** designation-gated
(relay-wide or per-user) — there is no "open full management"; OAuth scope alone
never unlocks it.

## Decision table

| Caller for `(user, app)` | May touch | Vouch (lite-session OK) | Dual-auth |
|---|---|---|---|
| First-party (relay-wide manager) / binding | whole account | ✅ | ✅ |
| Per-user `full` manager | whole account | ✅ | ✅ |
| Per-user `self` app | own slice | ✅ | ✅ |
| Granted, undesignated, policy=`open`/allowed | own slice | ❌ (no standing consent) | ✅ |
| Granted, undesignated, policy=`off`/excluded | nothing (mgmt) | ❌ | ❌ |

Rule of thumb: **vouch needs standing designation; dual-auth needs a real
session; whole-account needs manager status.**

## Per-method capability

Each `ops.*` declares the capability it needs. `self` methods take their sender
from the app token (never the body); `full` methods accept any target.

| Capability | Methods |
|---|---|
| **`self`-read** | `getRouting` (own slice), `listNotifications` (own) |
| **`self`-write** | `setRouting`, `setAppRouting`, `markRead` (own), `revokeSelf`, `muteSelf` |
| **`full`-read** | `listGrants`, `listPending`, `listChannels`, `getSettings`, `listDevices`, `getRouting` (full config), `listNotifications` (all) |
| **`full`-write** | `grant`, `revoke` (any), `denyPending`, `muteGrant` (any), `linkChannel`, `unlinkChannel`, `updateSettings`, `registerWebPush`, `unregisterWebPush`, `renameDevice`, `setDefaultRoute` |
| **infrastructure** (not user-data-scoped) | `verifyAppLogin` (token is self-authorizing), `listApps` (static catalog) |

Notes:
- `getRouting` / `listNotifications` exist at **both** scopes — they're distinct
  lexicons/handlers: the `self` ones return only the calling app's slice (already
  built); the `full` ones return the whole account.
- `revokeSelf` / `muteSelf` are **new** `self`-write methods so an app can let the
  user turn it off / mute it from inside the app (target is implicitly the caller —
  safe under fact #2). Whole-account `revoke`/`muteGrant` (any target) stay `full`.
- `registerWebPush` is `full`: a device belongs to the user, not to one app, so
  registering it is a dashboard action.

## Why third-party `full` is safe despite fact #2

The param-consent gap only bites when you rely on *per-call consent* to constrain
an app you didn't broadly trust. A `full` manager is a **deliberate broad
designation** — the same trust the user already places in atmo.pub, or that you'd
place in an email client. A malicious designated manager is "you picked a bad
manager," not a protocol hole. Undesignated apps never get whole-account, so the
gap can't be exploited there.

## Setting designations (UX)

No new machinery — reuse what exists:

- **In the dashboard** (implemented) — atmo.pub's app detail page has a
  "Management access" selector (`none → self → full`). Removing a manager revokes
  standing vouch immediately.
- **Magic-link bounce** — an app deep-links the user into atmo.pub (lite session,
  first-party), they flip the selector, and the app manages from then on. Reuses
  `CROSS-APP-AUTH.md`.

(A permission-time `requestPermission.requestsManagement` flag was considered and
**dropped** — the dashboard toggle + magic-link bounce cover it without
complicating the grant flow.)

## Data & config

- **Per-grant capability:** add `manage TEXT NOT NULL DEFAULT 'none'`
  (`'none' | 'self' | 'full'`) to the grants row — sits beside `muted`, mirrors
  the account-level `auto_allow` pattern. This is the relay-local source of truth.
- **Relay-wide managers:** the app registry from `ENABLE-FROM-WEB.md`
  (`src/lib/apps.ts`) gains `manager?: boolean` (relay-wide `full`).
- **Self policies:** `MANAGEMENT_SELF_READ_POLICY` (default `open`) and
  `MANAGEMENT_SELF_WRITE_POLICY` (default `user-allowlist`) env vars.

## Portability & audit (manager records) — v1 vs later

**v1: relay-local.** Designations live in the `manage` column. Simple, private
(nobody can see who your managers are), and needs no repo-write scope.

**Later (opt-in): repo records.** Mirror designations as
`pub.atmo.notify.manager` records (`{ app, level, createdAt }`) in the user's PDS
repo, so they're **portable** (travel if the user changes relays) and
**auditable** (one repo-native list of who can manage you). Tradeoffs that keep
this out of v1: repo records are world-readable (they leak which manager apps you
use), and writing them needs repo-write OAuth at designation time. When added, the
relay treats the repo as an additional source the user opts into — same
relay-local-now / repo-portable-later shape as the subscriber sync in
`ENABLE-FROM-WEB.md`.

## Wire protocol

- **`full` is a single envelope, `pub.atmo.notify.manage`** (chosen over ~20
  per-method lexicons — `full` has no read/write split and a manager mints one
  token, so an envelope is the right grain). Input `{ method, params?, userToken?,
  did? }`; a dispatch map routes `method` to the same `ops.*` the binding uses.
  `self` methods stay as their own lexicons (they need precise input schemas and
  the read/write split).
- A `verifyManagementCall(env, request, input, { lxm, need: 'self'|'full' })` helper:
  1. `verifySenderRequest` → app DID (always present).
  2. If `input.userToken` present → `verifyServiceToken` → user DID (must match any
     body DID); else expect a vouched body user DID.
  3. Resolve capability for `(userDID, appDID)` from relay-wide managers +
     per-grant `manage` + self policy.
  4. Admit only if capability ≥ `need`, and vouch only with standing designation.
  Then call the same `ops.*(env, userDID, input)`.
- **Binding stays** as the first-party fast path (same `ops`); the XRPC surface is
  the portable path for off-Cloudflare and third-party dashboards.
- **Optional shared-secret fallback** (`MANAGEMENT_SHARED_SECRET` + DID) for a
  non-atproto management backend that can't mint a DID-signed token. Strictly
  weaker than DID-auth (symmetric, unrotatable, no audit); don't build until
  needed.

## Security recap

- Authenticate the **app** by its DID-signed service-auth (`iss`), gate by DID —
  never by `client_id` (absent from the token) and never inferred from a user token.
- `full` requires **manager designation**; never reachable by scope or per-call
  consent alone.
- `self` is **own-slice forever** — sender from the app token, not the body.
- **Vouch** (no user token) demands standing designation; that's also the *only*
  management path that works for lite sessions. Undesignated apps need a real
  session (dual-auth).
- Manager-key compromise = an attacker manages that manager's users — bounded and
  rotatable via the DID doc; the same exposure atmo.pub already carries.

## Build checklist

- [x] grants: `manage` column (`0008`); `apps.ts` `manage?: 'self'|'full'` + `relayManageFor`;
      `MANAGEMENT_SELF_READ_POLICY` + `MANAGEMENT_SELF_WRITE_POLICY` env *(Slice 1)*
- [x] `verifyManagementCall` helper (app-auth + user-token/vouch + capability resolution) *(Slice 1)*
- [x] new `self`-write ops `revokeSelf` + `muteSelf`; retrofit the 4 self methods onto the helper *(Slice 1)*
- [x] `full` surface: the `pub.atmo.notify.manage` envelope → `ops.*` (binding kept as fast path) *(Slice 2)*
- [x] tests: capability matrix (self read/write/designated; full vouch + dual-auth + unknown method) *(Slices 1–2)*
- [x] dashboard: per-app capability control on the app detail page (`manage` on
      `RoutingApp` + `setGrantManage` binding/command + selector UI) *(Slice 3)*
- [~] dashboard: dedicated "your managers" view (list apps where `manage` != none) — optional; per-app control above already covers designation
- [—] `requestPermission` optional `requestsManagement` — **dropped** (dashboard toggle + magic-link bounce suffice)
- [ ] off-Cloudflare `verifyAppLogin` over XRPC (manager-app-authed) for cross-app login *(follow-up)*

## Deferred to v2

- **Repo-record manager designations** (portability + audit) — see *Portability &
  audit* above; v1 is relay-local.
- **Shared-secret management fallback** for non-atproto backends — DID-auth covers
  every atproto app; add only if such a backend appears.
