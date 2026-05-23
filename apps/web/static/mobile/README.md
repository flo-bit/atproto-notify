# Mobile OAuth client metadata

`oauth-client-metadata.json` is the **public OAuth client document** for the
`notify.atmo.tools` mobile app (Expo / React Native). It's served verbatim at:

    https://notify.atmo.tools/mobile/oauth-client-metadata.json

(SvelteKit serves `static/` as-is, with `Content-Type: application/json` for
`.json` files.)

It is consumed by `@atproto/oauth-client-expo` in `apps/mobile`. The app ships an
identical copy at `apps/mobile/lib/auth/client-metadata.ts` — **the two must stay
byte-compatible**. If they diverge, the OAuth flow breaks. Any change here needs a
matching change there and an app version bump.

Notes:

- `client_id` is this file's own URL (atproto OAuth identifies clients by their
  metadata URL).
- `redirect_uris` uses the custom scheme `tools.atmo.notify://oauth/callback` —
  the **reverse-DNS of the `client_id` host** (`notify.atmo.tools`), as atproto
  requires for native clients. The Expo app registers this scheme in `app.config.ts`.
- `token_endpoint_auth_method: "none"` + `application_type: "native"` +
  `dpop_bound_access_tokens: true` — public native client with DPoP-bound tokens.
- `scope` lists the relay `rpc` methods the app calls (mirrors the website's
  scope, plus `registerDevice` + `listNotifications`). `aud=*` lets the user's PDS
  mint service-auth tokens for the relay (`did:web:notifs.atmo.tools`).
