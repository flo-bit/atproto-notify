# Cross-app login (`pub.atmo.auth`) — implementation plan

Let another atproto app show a link that drops the user into **atmo.pub already
signed in**, with no OAuth round-trip. Borrowed from Roomy ↔ OpenMeet's
service-auth pattern, simplified for our architecture.

The key simplification: **atmo.pub only ever needs `locals.did`.** Every action
goes through the trusted `RELAY` service binding (`relayFor(platform, did)`), and
the web app's own `OAUTH_SCOPE` is just `'atproto'` (identity). So a session
minted from a service-auth identity proof is *functionally identical* to a full
OAuth session — there is no OpenMeet-style "degraded new-user" mode. atmo.pub
never writes to the user's PDS, so it needs nothing more than the verified DID.

## How it works

```
Sender app (holds the user's OAuth session)
  │ 1. mint PDS service-auth JWT:
  │      iss = user DID, aud = did:web:relay.atmo.pub,
  │      lxm = pub.atmo.auth, exp ≈ 60s
  │      (com.atproto.server.getServiceAuth — needs scope rpc?lxm=pub.atmo.auth&aud=*)
  │ 2. window.open → https://atmo.pub/applogin?token=<jwt>&redirect=/apps/<sender-did>
  ▼
atmo.pub  /applogin  (+server.ts GET)
  │ 3. platform.env.RELAY.verifyAppLogin(token)  ── binding, not public XRPC
  │      relay: resolve DID doc, verify sig, check aud + lxm + exp,
  │             single-use via SHA-256(token) in KV  → { did }
  │ 4. set signed cookie (DID + exp, 30d), Referrer-Policy: no-referrer
  │ 5. 303 → validated redirect (strips the token from the URL)
  ▼
hooks.server.ts honors the cookie → locals.did + locals.authVia='link'
```

## Locked decisions

1. **Token in the link, single-use.** The PDS-signed JWT goes straight in
   `?token=`. It is itself single-use (KV token-hash) + ~60s, so it has the same
   security properties as an opaque code; the DID it reveals isn't secret. The
   `/applogin` response 303-redirects immediately (no HTML/subresources) and sets
   `Referrer-Policy: no-referrer`, so the token doesn't leak to third parties; it
   is inert after first use even if it lingers in history/logs.
   *Hardening option (not now): put the token in the URL `#fragment` and POST it
   from client JS, so it never reaches server access logs at all.*
2. **lxm = `pub.atmo.auth`.** A generic "sign in to an atmo app" primitive (a
   convention NSID string, no published lexicon — same as OpenMeet's
   `net.openmeet.auth`). It is part of the public integration contract: senders
   put `rpc?lxm=pub.atmo.auth&aud=*` in their OAuth scope.
3. **`aud = did:web:relay.atmo.pub`.** The relay is the verifying authority and
   the verifier already accepts this DID, so no new did:web is needed.
4. **Verification on the private binding.** New `verifyAppLogin(token)` on
   `RelayRpc` / `NotifsRpc`. Public XRPC stays locked to `requestPermission` +
   `send` — third parties only *mint* tokens; only atmo.pub's server *consumes*
   them, and it has the binding.
5. **Separate 30-day lite-session cookie.** A short-lived identity proof becomes
   a longer-lived bearer cookie — the one real tradeoff (OpenMeet's headline
   caveat). We cap it at 30 days (vs. the OAuth cookie's 180) to shrink the blast
   radius of a leaked link. The cookie carries only `{ did, exp }`, HMAC-signed
   with `COOKIE_SECRET`; `exp` is re-checked server-side.
6. **`locals.authVia: 'oauth' | 'link' | null`.** Cheap to add now; lets any
   future PDS-writing feature require a real OAuth upgrade. Today both paths are
   equivalent because atmo.pub does no PDS writes.
7. **Deep-link to the app's own settings.** Senders default `redirect` to
   `/apps/<their-own-did>` so "Configure notifications for X" lands exactly there,
   pre-authed. General SSO (`redirect=/inbox`) is just a different target.

## The contract (what a third-party sender implements)

```
Scope:    atproto rpc?lxm=pub.atmo.auth&aud=*           (alongside requestPermission)
Mint:     com.atproto.server.getServiceAuth({ aud: 'did:web:relay.atmo.pub',
                                               lxm: 'pub.atmo.auth' })
Link:     https://atmo.pub/applogin?token=<jwt>&redirect=<relative-path>
```

`redirect` must be a relative path (`/…`, not `//`, no scheme). atmo.pub
re-validates and falls back to `/apps` on anything invalid.

## Changes by package

### `apps/relay`
- **`src/auth/appLogin.ts`** (new) — `verifyAppLogin(env, token) → { did }`:
  - Build a synthetic `Request` with `Authorization: Bearer <token>` and call the
    existing `getVerifier(env).verifyRequest(req, { lxm: 'pub.atmo.auth' })`
    (audiences already include `did:web:relay.atmo.pub`).
  - Single-use: `key = 'applogin:' + base64url(sha256(token))`; if
    `CACHE.get(key)` exists → reject (replay); else `CACHE.put(key, '1', { expirationTtl: 300 })`.
    Keyed on the token hash, not `jti`, so it works whether or not the PDS emits a
    unique nonce (the shared verifier has no `replayStore`, so non-jti
    `requestPermission` tokens keep working).
  - Throw a typed error on any failure; the web route maps it to a clean fallback.
- **`src/rpc/ops.ts`** — `export async function verifyAppLogin(env, token)`
  wrapping the above (optionally `ensureUser` — the first management call already
  does, so optional).
- **`src/rpc/entrypoint.ts`** — `verifyAppLogin(token: string)` method on
  `RelayRpc`.
- **`packages/lexicons/src/rpc.ts`** — add to `NotifsRpc`:
  `verifyAppLogin(token: string): Promise<{ did: Did }>` (the one method with no
  leading `did` — it's pre-auth; documented as such).
- No migration (replay state is KV, not D1).
- Tests: `test/appLogin.test.ts` — valid token → did; wrong lxm; wrong aud;
  expired; replay (second use rejected). Mint test tokens with `createServiceJwt`
  + a throwaway P-256 key whose DID doc the resolver is stubbed to return (mirror
  existing auth tests).

### `apps/web`
- **`src/lib/server/liteSession.ts`** (new) — `sign(did)` / `verify(cookieValue)`
  using WebCrypto HMAC-SHA256 over `COOKIE_SECRET`; payload `{ did, exp }`,
  format `b64url(json).b64url(mac)`; `verify` checks the MAC and `exp`.
- **`src/routes/applogin/+server.ts`** (new) — `GET`: read `token` + `redirect`;
  `platform.env.RELAY.verifyAppLogin(token)`; on success `cookies.set('atmo_session',
  sign(did), { httpOnly, secure, sameSite:'lax', path:'/', maxAge: 60*60*24*30 })`
  and `303` to the validated redirect; on failure `303 → /?login=expired`. Set
  `Referrer-Policy: no-referrer`.
- **`src/hooks.server.ts`** — wrap `atproto.handle`: run the OAuth handle; if it
  didn't set `locals.did`, read+verify `atmo_session` → set `locals.did` +
  `locals.authVia='link'`. Set `locals.authVia='oauth'` when OAuth populated it.
- **`src/app.d.ts`** — add `authVia: 'oauth' | 'link' | null` to `App.Locals`;
  add `verifyAppLogin` to the `RELAY` binding type (comes free via `NotifsRpc`).
- **`src/lib/atproto/oauth.remote.ts`** — `oauthLogout` also clears `atmo_session`.
- (Optional UI) Settings shows "Signed in via a link from another app — sign in
  fully" when `authVia==='link'`. Not required for function.

### `apps/example-sender` (reference integration)
- **`src/lib/config.ts`** — add `rpc?lxm=pub.atmo.auth&aud=*` to `OAUTH_SCOPE`.
- **`src/lib/server/relay.ts`** — `mintAppLoginUrl(client)`:
  `getServiceAuth({ aud: RELAY_DID, lxm: 'pub.atmo.auth' })` → return
  `${DASHBOARD_ORIGIN}/applogin?token=${token}&redirect=${encodeURIComponent('/apps/' + SENDER_DID)}`.
- **`src/lib/relay.remote.ts`** — `command openInAtmo()` → `mintAppLoginUrl(locals.client)`.
- **`src/routes/+page.svelte`** — "Open in atmo.pub" button:
  `const w = window.open('about:blank'); const { url } = await openInAtmo(); w.location.href = url;`
  (the `about:blank` first preserves the user gesture / dodges popup blockers).

### `apps/homepage` (`/docs`)
- New "Cross-app login" section documenting the contract above + the security
  notes below.

## Security notes (carry into docs)

- **Short token → 30-day session.** Single-use + ~60s + 30-day cap shrink the
  window and blast radius, but a link captured before first use within its TTL
  yields a session. Don't log the links.
- **aud binding** — a token for `did:web:relay.atmo.pub` is useless at any other
  service. **lxm binding** — `pub.atmo.auth` tokens can't invoke anything else.
- **`aud=*` wildcard** in the sender scope lets a compromised sender mint tokens
  for other services that also accept `pub.atmo.auth`; low risk (only we use it).
  Senders may pin `aud=did:web:relay.atmo.pub` for max safety.
- **Trust identity, not metadata** — only the DID + verified signature are
  trusted; we store nothing the PDS volunteers.
- **PDS compromise / availability** — same federation tradeoffs as
  `requestPermission`: a compromised PDS can mint valid tokens; a down PDS means
  no link.

## Build checklist (when greenlit)

- [ ] relay: `verifyAppLogin` (auth/ops/entrypoint) + `NotifsRpc` method + tests
- [ ] web: `liteSession` helper, `/applogin` route, `hooks` wrap, `app.d.ts`,
      logout clears cookie
- [ ] example-sender: scope, `mintAppLoginUrl`, `openInAtmo`, button
- [ ] homepage `/docs`: cross-app login section
- [ ] verify monorepo green (relay tests + typecheck; web/homepage/example
      svelte-check; builds)
```
