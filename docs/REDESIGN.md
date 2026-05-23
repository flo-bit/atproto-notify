# atmo.pub redesign — implementation plan

Redesign of the webapp (`apps/web`) into a v2-style installable **PWA** with
**web push**, an **inbox**, and **per-category routing**. Loose inspiration from
`ref/design/project/v2.*` (read `v2.html` → its imports for screen-level detail).
Backend work lands in the relay (`apps/relay`).

## Locked decisions (2026-05-23)

1. **Domains unchanged.** Relay stays `relay.atmo.pub` (`did:web` untouched),
   webapp stays `atmo.pub`. This is a **UI rebrand only** → product name
   becomes **atmo.pub**. No OAuth `ORIGIN`/client_id change.
2. **Categories = free-form.** `send` carries an optional `category` string +
   optional `categoryDescription`. No sender "declare" step; the relay learns
   categories as they arrive. Routing keys on `(recipient, sender, category)`.
3. **No email channel.** Channels are **push + telegram** only.
4. **Trusted apps, hardcoded.** Replaces v2's "follows"/privacy/auto-allow: a
   hardcoded list of sender DIDs in relay config that **auto-grant** at
   `requestPermission` (skip pending). No Bluesky graph lookups, no privacy modes.
5. **Inbox keeps everything.** Every delivered notification is stored in the
   inbox (full history); per-category routing only decides which *alert* channels
   also fire (push / telegram). No pruning for now (revisit retention later).
6. **Keep the bell logo.** Wordmark renders `atmo.pub` (`.pub` muted), bell in accent.

Reused as-is: the v2 color tokens are identical to `apps/web/src/routes/layout.css`,
so theming carries straight over.

## Routing model

Routes available (after cutting email): `push`, `telegram`, `push+telegram`,
`inbox` (inbox-only, no alert), `off` (alias of inbox-only for now), `default`
(inherit user-wide `defaultRoute`). Resolution per notification:

1. Always insert a row into `notifications` (inbox = canonical log).
2. Look up routing for `(recipient, sender, category)`; fall back to the user's
   `defaultRoute`.
3. Fan out alerts to the resolved channels (push and/or telegram).

## Phases

### Phase 0 — Rebrand + foundation (no behavior change)
- Rename product → **atmo.pub** in `apps/web`, `apps/homepage`, relay Telegram
  copy (`telegram/commands.ts`, dashboard links), and docs. Wordmark `atmo.pub`,
  keep bell `Logomark`.
- Build a shared component layer in `apps/web/src/lib/components` ported from v2:
  `Icon` (glyph set), `AppMark`, `RouteChip`, `IOSToggle`, `ActorStack`, plus the
  Inbox/Apps/Settings shell (desktop split + mobile bottom-tab nav).
- Remove the migrated landing (`/`) and `/docs` from `apps/web` (now in
  `apps/homepage`); `/` becomes the clean Login.

### Phase 1 — PWA shell + restyle current features (frontend only)
- **Login** (clean), **Apps** (today's grants + pending + denied, v2 styling),
  **Settings** (Telegram channel + existing toggle). **Inbox** tab present as a
  "coming soon" placeholder. Responsive desktop + mobile.
- Make `apps/web` an **installable PWA**: `manifest.webmanifest`, icons, minimal
  service worker (install/offline shell only — no push yet).
- Backend: none (rides existing `RelayRpc` binding).

### Phase 2 — Web push (headline feature)
- Relay:
  - Generate **VAPID** keypair (public in config, private as `VAPID_PRIVATE_KEY`
    secret).
  - New `push_subscriptions` table: `(did, endpoint PK, p256dh, auth, created_at)`
    — multiple per user. Telegram stays in `channels`. Migration `0004_push`.
  - Web Push delivery (aes128gcm encryption + VAPID JWT via WebCrypto, no node) in
    the dispatcher; dead endpoints (404/410) pruned.
  - Binding methods `registerWebPush(did, subscription)` / `unregisterWebPush(did, endpoint)`.
  - Until Phase 4, `send` fans out globally to push + telegram.
- Client: service worker `push` → `showNotification`; `PushManager.subscribe` with
  the VAPID public key; subscription registered via web server → binding. Settings
  shows push devices (count + revoke).

### Phase 3 — Inbox
- Relay:
  - `notifications` table: `(id, recipient_did, sender_did, category, title, body,
    uri, actors_json, created_at, read_at)`. Migration `0005_inbox`.
  - `send` writes a notification row for every delivery; gains optional
    **`category`**, **`categoryDescription`**, **`actors[]`** (additive lexicon change).
  - Binding methods `listNotifications(did, cursor)` (paged) + `markRead(did, ids|all)`.
- Client: **Inbox** screen — actor stacks, route chips, unread state, mark-read;
  swipe/grouped variants optional.
- Update `apps/example-sender` + homepage `/docs` for the new `send` fields.

### Phase 4 — Per-category routing + trusted apps
- Relay:
  - `app_categories` table: discovered `(sender_did, category, description, count,
    last_seen)` so the routing UI can list them.
  - `routing` table: `(recipient_did, sender_did, category, routes_json)`; user
    `default_route` + optional `quiet_hours` columns on `users`. Migration `0006_routing`.
  - Dispatcher resolves route per notification (see Routing model) and fans out.
  - **Trusted apps**: hardcoded `TRUSTED_SENDERS` in relay config; `requestPermission`
    auto-grants for those DIDs.
  - (Optional) quiet hours applied at delivery; can be cut.
  - Binding methods `getRouting(did)` / `setRouting(did, sender, category, routes)`;
    extend `updateSettings` for `defaultRoute` (+ quiet hours).
- Client: app-detail per-category routing UI, Default-routing screen, Channels,
  read-only Trusted-apps list. (v2 has 3 routing-UI variations in
  `v2-variations.jsx` — pick one.)

## Deferred / out of scope (for now)
- Email channel. Bluesky-graph "follows" privacy. Notification retention/pruning.
- Native push (project is PWA-only — see `mobile-and-push` memory).

## Cross-cutting
- Theming reuse (tokens already match v2); accessibility (focus rings, reduced
  motion already in `layout.css`); keep the `RelayRpc` service-binding boundary —
  all new first-party methods go on the binding, never public XRPC. Only `send`
  changes are public (and additive).
