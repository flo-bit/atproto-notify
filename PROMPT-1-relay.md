# Build the atproto notification relay (monorepo + lexicons + Cloudflare Worker)

You're building a Cloudflare Workers service that lets any AT Protocol app send notifications to its users. Users approve which apps can send via a separate SvelteKit website (built in a follow-up prompt). Delivery in v1 is via Telegram bot.

This prompt sets up the monorepo, the shared lexicons package, and the relay Worker. The SvelteKit website goes into `apps/web` later — leave that empty for now, but include it in `pnpm-workspace.yaml`.

---

## Configuration constants (used throughout — surface in a single README section)

- **Relay domain**: `notifs.atmo.tools`
- **Relay DID**: `did:web:notifs.atmo.tools`
- **Relay service ID**: `#notif_relay` (so service-ref form is `did:web:notifs.atmo.tools#notif_relay`)
- **Lexicon NSID prefix**: `tools.atmo.notifs`
- **Pending request TTL**: 7 days
- **Link token TTL**: 10 minutes
- **DID doc cache TTL (in KV)**: 5 minutes
- **Profile cache TTL (in `senders` table)**: 24 hours

These values appear in many places. Put a clear "Configuration" section at the top of the root README listing where they live so the user can find-replace later if needed.

---

## Stack (non-negotiable)

- **Package manager**: pnpm (workspaces)
- **Language**: TypeScript, strict mode
- **Runtime**: Cloudflare Workers (modules format)
- **XRPC framework**: `@atcute/xrpc-server` (the plain package works on Workers natively — the cloudflare adapter is only for WebSocket subscriptions, which this project doesn't use)
- **JWT verification**: `@atcute/xrpc-server/auth` (`ServiceJwtVerifier`)
- **DID resolution**: `@atcute/identity-resolver` with `CompositeDidDocumentResolver` (plc + web)
- **Outgoing atproto calls** (fetching sender profiles): `@atcute/client`
- **Lexicon types**: `@atcute/lex-cli` — set up `pnpm generate` in the lexicons package
- **Persistent state**: Cloudflare D1
- **Caching**: Cloudflare KV
- **Async dispatch**: Cloudflare Queues
- **Telegram**: Bot API via plain `fetch` (no SDK needed)
- **Testing**: vitest with `@cloudflare/vitest-pool-workers`

---

## Monorepo layout

Create exactly this structure:

```
.
├── package.json                  # workspace root, private, scripts
├── pnpm-workspace.yaml           # includes apps/* and packages/*
├── tsconfig.base.json            # shared strict config
├── .gitignore                    # node_modules, .wrangler, dist, etc.
├── README.md                     # overview, setup, config, deployment
├── apps/
│   ├── relay/
│   │   ├── package.json
│   │   ├── wrangler.toml
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts          # default export { fetch, queue, scheduled }
│   │   │   ├── env.ts            # Env type for bindings
│   │   │   ├── router.ts         # builds the XRPCRouter, wires handlers
│   │   │   ├── auth/
│   │   │   │   ├── verifier.ts   # constructs ServiceJwtVerifier
│   │   │   │   ├── sender.ts     # verifySenderRequest(req, lxm)
│   │   │   │   └── user.ts       # verifyUserRequest(req, lxm)
│   │   │   ├── xrpc/
│   │   │   │   ├── requestPermission.ts
│   │   │   │   ├── send.ts
│   │   │   │   ├── grant.ts
│   │   │   │   ├── revoke.ts
│   │   │   │   ├── denyPending.ts
│   │   │   │   ├── muteGrant.ts
│   │   │   │   ├── listGrants.ts
│   │   │   │   ├── listPending.ts
│   │   │   │   ├── linkChannel.ts
│   │   │   │   ├── unlinkChannel.ts
│   │   │   │   ├── listChannels.ts
│   │   │   │   ├── getSettings.ts
│   │   │   │   └── updateSettings.ts
│   │   │   ├── delivery/
│   │   │   │   ├── telegram.ts   # low-level sendMessage / answerCallbackQuery
│   │   │   │   └── dispatcher.ts # queue consumer
│   │   │   ├── telegram/
│   │   │   │   ├── webhook.ts    # POST /telegram/webhook/:secret
│   │   │   │   ├── commands.ts   # /start, /list, /revoke, /settings
│   │   │   │   └── callbacks.ts  # approve:/deny:/toggle: handlers
│   │   │   ├── db/
│   │   │   │   ├── schema.sql    # canonical schema reference (matches migrations)
│   │   │   │   └── queries.ts    # typed query functions
│   │   │   ├── identity/
│   │   │   │   └── resolve.ts    # DID resolution with KV caching
│   │   │   ├── profile/
│   │   │   │   └── fetch.ts      # fetch Bluesky profile for a sender DID
│   │   │   ├── ratelimit.ts      # KV-backed counters
│   │   │   ├── well-known.ts     # serves did.json + lexicon JSONs
│   │   │   └── lib/
│   │   │       ├── errors.ts     # convenience XRPCError wrappers
│   │   │       ├── ids.ts        # cuid2/nanoid-based id helpers
│   │   │       └── time.ts       # now(), addDays(), etc.
│   │   ├── migrations/
│   │   │   └── 0001_init.sql
│   │   └── test/
│   │       ├── auth.test.ts
│   │       ├── requestPermission.test.ts
│   │       ├── grant.test.ts
│   │       ├── send.test.ts
│   │       ├── telegram-link.test.ts
│   │       └── ratelimit.test.ts
│   └── web/                      # placeholder; SvelteKit goes here later
│       └── .gitkeep
└── packages/
    └── lexicons/
        ├── package.json          # name: "@atmo/notifs-lexicons", exports types
        ├── tsconfig.json
        ├── lex.config.json       # @atcute/lex-cli config
        ├── lexicons/
        │   └── tools/atmo/notifs/
        │       ├── requestPermission.json
        │       ├── send.json
        │       ├── grant.json
        │       ├── revoke.json
        │       ├── denyPending.json
        │       ├── muteGrant.json
        │       ├── listGrants.json
        │       ├── listPending.json
        │       ├── linkChannel.json
        │       ├── unlinkChannel.json
        │       ├── listChannels.json
        │       ├── getSettings.json
        │       ├── updateSettings.json
        │       ├── authSender.json
        │       └── authUser.json
        └── src/
            └── index.ts          # re-exports generated types
```

---

## Lexicons — write all 15 as actual JSON files

All use `"lexicon": 1`. All NSIDs follow `tools.atmo.notifs.<name>`.

### Sender-authenticated procedures

**`tools.atmo.notifs.requestPermission`** (procedure):

- input: `{ recipient: string (format: did), reason?: string (maxLength: 200) }`
- output: `{ id: string, status: "pending" | "alreadyGranted" }`
- errors: `NotAuthorized`, `RateLimitExceeded`

**`tools.atmo.notifs.send`** (procedure):

- input: `{ recipient: string (format: did), title: string (maxLength: 100), body: string (maxLength: 500), uri?: string, threadKey?: string }`
- output: `{ id: string, delivered: integer }`
- errors: `NotAuthorized`, `RateLimitExceeded`

### User-authenticated procedures and queries

**`tools.atmo.notifs.grant`** (procedure):

- input: `{ sender: string (format: did), requestId?: string }`
- output: `{ granted: boolean }`

**`tools.atmo.notifs.revoke`** (procedure):

- input: `{ sender: string (format: did) }`
- output: `{ revoked: boolean }`

**`tools.atmo.notifs.denyPending`** (procedure):

- input: `{ requestId: string }`
- output: `{ denied: boolean }`
- (Deletes the pending request without granting. Doesn't blocklist the sender; the sender can request again after rate limits allow.)

**`tools.atmo.notifs.muteGrant`** (procedure):

- input: `{ sender: string (format: did), muted: boolean }`
- output: `{ muted: boolean }`

**`tools.atmo.notifs.listGrants`** (query):

- output: `{ grants: array of objects with: sender (did), senderHandle?, senderDisplayName?, senderAvatar?, grantedAt (datetime), muted (boolean) }`

**`tools.atmo.notifs.listPending`** (query):

- output: `{ pending: array of objects with: id, sender (did), senderHandle?, senderDisplayName?, senderAvatar?, reason?, createdAt (datetime), expiresAt (datetime) }`

**`tools.atmo.notifs.linkChannel`** (procedure):

- input: `{ platform: "telegram" }` (use closed enum, only one value for v1)
- output: `{ token: string, deepLink: string }`

**`tools.atmo.notifs.unlinkChannel`** (procedure):

- input: `{ platform: "telegram" }`
- output: `{ unlinked: boolean }`

**`tools.atmo.notifs.listChannels`** (query):

- output: `{ channels: array of objects with: platform, linkedAt (datetime), displayName? }`

**`tools.atmo.notifs.getSettings`** (query):

- output: `{ notifyPendingViaTelegram: boolean }`

**`tools.atmo.notifs.updateSettings`** (procedure):

- input: `{ notifyPendingViaTelegram?: boolean }` (all fields optional, partial update)
- output: `{ notifyPendingViaTelegram: boolean }`

### Permission sets

**`tools.atmo.notifs.authSender`**:

```json
{
  "lexicon": 1,
  "id": "tools.atmo.notifs.authSender",
  "defs": {
    "main": {
      "type": "permission-set",
      "title": "Send notifications",
      "detail": "Allow this app to request permission to send you notifications and to deliver them to your linked channels (like Telegram).",
      "permissions": [
        {
          "type": "permission",
          "resource": "rpc",
          "inheritAud": true,
          "lxm": [
            "tools.atmo.notifs.requestPermission",
            "tools.atmo.notifs.send"
          ]
        }
      ]
    }
  }
}
```

**`tools.atmo.notifs.authUser`**:

```json
{
  "lexicon": 1,
  "id": "tools.atmo.notifs.authUser",
  "defs": {
    "main": {
      "type": "permission-set",
      "title": "Manage your notifications",
      "detail": "Allow this app to view and manage which apps can send you notifications, link delivery channels, and adjust your notification settings.",
      "permissions": [
        {
          "type": "permission",
          "resource": "rpc",
          "inheritAud": true,
          "lxm": [
            "tools.atmo.notifs.grant",
            "tools.atmo.notifs.revoke",
            "tools.atmo.notifs.denyPending",
            "tools.atmo.notifs.muteGrant",
            "tools.atmo.notifs.listGrants",
            "tools.atmo.notifs.listPending",
            "tools.atmo.notifs.linkChannel",
            "tools.atmo.notifs.unlinkChannel",
            "tools.atmo.notifs.listChannels",
            "tools.atmo.notifs.getSettings",
            "tools.atmo.notifs.updateSettings"
          ]
        }
      ]
    }
  }
}
```

---

## D1 schema (`migrations/0001_init.sql`)

```sql
CREATE TABLE users (
  did TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  notify_pending_via_telegram INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE channels (
  did TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (did, platform)
);
CREATE UNIQUE INDEX channels_by_platform_user ON channels (platform, platform_user_id);

CREATE TABLE link_tokens (
  token TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  platform TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX link_tokens_by_did ON link_tokens (did);
CREATE INDEX link_tokens_by_expires ON link_tokens (expires_at);

CREATE TABLE senders (
  did TEXT PRIMARY KEY,
  handle TEXT,
  display_name TEXT,
  avatar_url TEXT,
  profile_fetched_at INTEGER
);

CREATE TABLE pending_requests (
  id TEXT PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (recipient_did, sender_did)
);
CREATE INDEX pending_by_recipient ON pending_requests (recipient_did);
CREATE INDEX pending_by_expires ON pending_requests (expires_at);

CREATE TABLE grants (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  muted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipient_did, sender_did)
);
CREATE INDEX grants_by_recipient ON grants (recipient_did);

CREATE TABLE delivery_log (
  id TEXT PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  title TEXT,
  delivered_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX delivery_by_recipient ON delivery_log (recipient_did, created_at DESC);
```

All timestamps are unix milliseconds (`Date.now()`). Use parameterised queries throughout — never string interpolation. Put each query in `db/queries.ts` as a named, typed function.

---

## Auth model

Two distinct paths, both using `ServiceJwtVerifier` from `@atcute/xrpc-server/auth`:

```ts
import { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';
import {
  CompositeDidDocumentResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
} from '@atcute/identity-resolver';

export function makeVerifier() {
  return new ServiceJwtVerifier({
    acceptAudiences: [
      'did:web:notifs.atmo.tools',
      'did:web:notifs.atmo.tools#notif_relay',
    ],
    resolver: new CompositeDidDocumentResolver({
      methods: {
        plc: new PlcDidDocumentResolver(),
        web: new WebDidDocumentResolver(),
      },
    }),
    maxAge: 300,
    clockLeeway: 5,
  });
}
```

Wrap DID resolution with KV caching (5-minute TTL) — the verifier accepts a resolver, but you can also cache at the resolver layer by wrapping `PlcDidDocumentResolver`.

**Sender path** (used by `requestPermission`, `send`): the JWT issuer is the sender's DID, signed with the sender's signing key from their DID document. Helper: `verifySenderRequest(req, lxm) → { senderDid }`.

**User path** (used by every other procedure/query): the JWT issuer is the end user's DID, signed by the user's PDS via `com.atproto.server.getServiceAuth`. The website obtains these JWTs on the user's behalf and passes them to the relay. Helper: `verifyUserRequest(req, lxm) → { userDid }`.

Both helpers throw `AuthRequiredError` with a populated `wwwAuthenticate` on every failure path (the `ServiceJwtVerifier` already does this).

The relay does **not** mint outgoing JWTs and does **not** need a private signing key.

---

## XRPC handler behavior (precise)

### `requestPermission` (sender path)

1. `verifySenderRequest` → `senderDid`.
2. If a grant already exists for `(senderDid, input.recipient)`, return `{ id: <some stable id>, status: "alreadyGranted" }`.
3. Per-pair pending cap: if a non-expired pending request exists for `(senderDid, input.recipient)`, return that row's `{ id, status: "pending" }` — do **not** insert another.
4. Per-sender global rate limit: KV counter keyed `rl:req:<senderDid>` with 1-hour window; max 100 new pending requests per hour. If exceeded, throw `RateLimitExceededError`.
5. Insert pending row with `expires_at = now + 7 days`, `id = cuid2-or-nanoid`.
6. Fire-and-forget: ensure sender profile is fresh in `senders` (refetch if missing or `profile_fetched_at` is older than 24h). Use `@atcute/client` against `https://public.api.bsky.app` calling `app.bsky.actor.getProfile`. Cache outcome including failure.
7. If recipient has linked Telegram **and** `users.notify_pending_via_telegram = 1`, enqueue a `pendingRequest` dispatcher job.
8. Return `{ id, status: "pending" }`.

### `send` (sender path)

1. `verifySenderRequest` → `senderDid`.
2. Lookup grant for `(senderDid, recipient)`. If missing, throw `XRPCError({ status: 403, error: 'NotAuthorized' })`. If `muted = 1`, accept silently: write a delivery_log row with `delivered_count = 0`, return `{ id, delivered: 0 }`.
3. Rate limits (both via KV counters):
   - Per-pair per-second: 1/sec. Exceed → 429 with `Retry-After: 1`.
   - Per-pair daily: 100/24h. Exceed → 429 with `Retry-After: <seconds until window resets>`.
4. Lookup recipient's `channels`. If empty, write delivery_log with `delivered_count = 0` and return `{ id, delivered: 0 }`.
5. For each channel, enqueue a `notification` dispatcher job containing `{ channel, title, body, uri, threadKey, senderDid }`.
6. Write delivery_log with `delivered_count = channels.length`.
7. Return `{ id, delivered: channels.length }`.

### `grant` (user path)

1. `verifyUserRequest` → `userDid`.
2. Upsert into `grants` (`recipient_did = userDid`, `sender_did = input.sender`, `granted_at = now`, `muted = 0`).
3. If `input.requestId` provided, `DELETE FROM pending_requests WHERE id = ? AND recipient_did = userDid`.
4. Ensure `users` row exists (insert if missing).
5. Return `{ granted: true }`.

### `revoke` (user path)

1. `verifyUserRequest` → `userDid`.
2. Delete grant for `(userDid, input.sender)`.
3. Also delete any pending request for the same pair (it's irrelevant now).
4. Return `{ revoked: <boolean from rows affected> }`.

### `denyPending` (user path)

1. `verifyUserRequest` → `userDid`.
2. `DELETE FROM pending_requests WHERE id = ? AND recipient_did = userDid`.
3. Return `{ denied: <boolean> }`.

### `muteGrant` (user path)

1. `verifyUserRequest` → `userDid`.
2. Update grant's `muted` column.
3. Return `{ muted: input.muted }`.

### `listGrants` (user path)

1. `verifyUserRequest` → `userDid`.
2. `SELECT g.*, s.handle, s.display_name, s.avatar_url FROM grants g LEFT JOIN senders s ON s.did = g.sender_did WHERE g.recipient_did = ? ORDER BY g.granted_at DESC`.
3. Return as `{ grants: [...] }`.

### `listPending` (user path)

1. `verifyUserRequest` → `userDid`.
2. Same join pattern, filter `expires_at > now`.
3. Return as `{ pending: [...] }`.

### `linkChannel` (user path)

1. `verifyUserRequest` → `userDid`.
2. Ensure `users` row exists.
3. Generate a 32-char URL-safe random token (use `crypto.getRandomValues` + base64url, not `Math.random`).
4. Insert into `link_tokens` with `expires_at = now + 10 min`.
5. Build deepLink: `https://t.me/<BOT_USERNAME>?start=<token>`.
6. Return `{ token, deepLink }`.

### `unlinkChannel` (user path)

1. `verifyUserRequest` → `userDid`.
2. Delete from `channels` where `(did, platform)` matches.
3. Return `{ unlinked: <boolean> }`.

### `listChannels`, `getSettings`, `updateSettings`

Straightforward. `updateSettings` is a partial PATCH — only update fields present in the input. `getSettings` ensures the user row exists (returns defaults if not).

---

## Telegram bot integration

### Webhook endpoint

Route: `POST /telegram/webhook/:secret`. The path-segment secret must match `env.TELEGRAM_WEBHOOK_SECRET`. Telegram is configured (out of band) with this URL via `setWebhook`. The README must explain this and provide a snippet of how to call `setWebhook` with curl.

The webhook receives JSON updates. Dispatch by update type:

- `update.message` with a `/` prefix → `commands.ts`
- `update.callback_query` → `callbacks.ts`
- Anything else → 200 OK, ignore

Always respond 200 OK to Telegram even on internal errors — Telegram retries aggressively otherwise. Log internal errors to console; surface to the user via a follow-up sendMessage if appropriate.

### Commands (`/...`)

- **`/start <token>`** — lookup `link_tokens` row. If valid (not expired, exists), find or insert `users` row for the DID, insert into `channels` (replacing any existing row for that DID + telegram), capture `update.message.from.username` as `display_name` if available, delete the token row, reply with markdown: `✅ Linked to @<handle-or-did>`. If invalid/expired, reply with "This link expired. Generate a new one at https://notifs.atmo.tools/dashboard".
- **`/start`** (no arg) — reply with a welcome message and the dashboard URL.
- **`/list`** — look up the DID from the chat_id (via `channels`), fetch grants, render as a markdown list with handles. If no grants: "You haven't authorized any apps yet."
- **`/revoke <handle-or-did>`** — resolve handle to DID if needed, delete the grant, reply with confirmation. If no matching grant, reply with that.
- **`/settings`** — show current settings and an inline keyboard with toggle buttons.
- **Anything else** — short help message listing available commands.

### Callback queries (inline button taps)

`callback_query.data` formats:

- `approve:<requestId>` — look up pending, verify it belongs to the DID linked to this chat_id, write grant, delete pending, edit the original message to "✅ Approved <sender>". Always `answerCallbackQuery` to dismiss the spinner.
- `deny:<requestId>` — delete pending, edit to "❌ Denied <sender>".
- `toggle:notifyPending` — flip `users.notify_pending_via_telegram`, edit the settings message with the new state.

If the chat_id isn't linked, reply via `answerCallbackQuery({ text: "Account not linked. Visit the website.", show_alert: true })`.

### Markdown formatting

Use Markdown V2. Escape special characters carefully — `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!` all need escaping when they appear in user content. Write a small `escapeMd(text: string)` helper.

---

## Queue dispatcher

Single Queue, single consumer Worker (same Worker, exported `queue` handler).

Job shape:

```ts
type DispatchJob =
  | {
      kind: 'notification';
      channel: { platform: 'telegram'; platformUserId: string };
      title: string;
      body: string;
      uri?: string;
      senderDid: string;
    }
  | {
      kind: 'pendingRequest';
      channel: { platform: 'telegram'; platformUserId: string };
      requestId: string;
      senderHandle: string;
      senderDisplayName?: string;
      reason?: string;
    };
```

Handler:

- `notification` → Telegram `sendMessage` formatted as:

  ```
  *<escaped title>*
  <escaped body>
  ```

  Plus a single inline button with `text: "Open"` and `url: <uri>` when `uri` is present.

- `pendingRequest` → `sendMessage` with text including sender display name + handle + reason, and an inline keyboard:

  ```
  [ ✅ Allow ] [ ❌ Deny ]
  ```

  Callback data `approve:<requestId>` and `deny:<requestId>`.

Use Queues' built-in retry. On `403 Forbidden: bot was blocked by the user`, mark this channel dead — `DELETE FROM channels` for the row. Don't retry. Same for `400 chat not found`.

---

## Well-known endpoints

- **`GET /.well-known/did.json`** — serve the relay's DID document:

  ```json
  {
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:web:notifs.atmo.tools",
    "service": [
      {
        "id": "#notif_relay",
        "type": "AtprotoNotificationRelay",
        "serviceEndpoint": "https://notifs.atmo.tools"
      }
    ]
  }
  ```

  No `verificationMethod` block — the relay doesn't sign anything.

- **`GET /xrpc/_health`** — return `{ status: "ok" }`. Use `XRPCRouter`'s `handleHealthCheck`.

- **`GET /lexicons/:nsid`** — serve the corresponding lexicon JSON file. Bundle the JSONs into the Worker (import them as JSON modules) so they're served from KV/CDN-cacheable static responses. Set `Cache-Control: public, max-age=3600`.

---

## Router wiring

Use `@atcute/xrpc-server`'s `XRPCRouter`. Mount each handler with `router.addQuery` / `router.addProcedure`. Wrap auth and rate-limiting inside each handler — don't try to do middleware globally, since some handlers use sender path and others user path.

Top-level `fetch` handler dispatches:

- `/.well-known/did.json` → static
- `/lexicons/*` → static
- `/telegram/webhook/*` → telegram webhook
- everything else → `router.fetch(request)`

Use the `onError` hook on the router to log unexpected errors to console (which Workers ships to Logpush / observability automatically).

---

## Rate limiting helper

```ts
// ratelimit.ts
export async function checkAndIncrement(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }>;
```

Implementation: read the current count from KV; if absent, set to 1 with `expirationTtl = windowSeconds`. If present, read remaining TTL via a `metadata.expiresAt` you wrote on initial set, increment, write back with the same TTL. Returns whether the increment was within `limit`. Note that KV's eventual consistency means small over-counts are possible — that's acceptable here.

---

## Cron trigger

In `wrangler.toml` configure a cron `0 3 * * *` (daily 3am UTC). Handler `scheduled`:

- `DELETE FROM pending_requests WHERE expires_at < now`
- `DELETE FROM link_tokens WHERE expires_at < now`
- Optionally: `DELETE FROM delivery_log WHERE created_at < now - 30 days` for housekeeping

---

## `wrangler.toml` template

```toml
name = "notifs-relay"
main = "src/index.ts"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "notifs.atmo.tools/*", custom_domain = true }
]

[[d1_databases]]
binding = "DB"
database_name = "notifs-relay"
database_id = "REPLACE_ME"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "CACHE"
id = "REPLACE_ME"

[[queues.producers]]
binding = "DISPATCH_QUEUE"
queue = "notifs-dispatch"

[[queues.consumers]]
queue = "notifs-dispatch"
max_batch_size = 10
max_batch_timeout = 5
max_retries = 3

[triggers]
crons = ["0 3 * * *"]

[vars]
RELAY_DID = "did:web:notifs.atmo.tools"
BOT_USERNAME = "REPLACE_ME"  # e.g. "atmonotifsbot"

# Secrets set via `wrangler secret put`:
# - TELEGRAM_BOT_TOKEN
# - TELEGRAM_WEBHOOK_SECRET
```

---

## Tests

Use `@cloudflare/vitest-pool-workers`. Write at least these:

- **`auth.test.ts`** — happy path JWT verify; expired; bad audience; wrong lxm; unknown DID.
- **`requestPermission.test.ts`** — first request creates pending; duplicate within window returns the same pending; alreadyGranted path; rate-limit returns 429.
- **`grant.test.ts`** — grant inserts a row; with requestId deletes pending; revoke removes the grant.
- **`send.test.ts`** — no grant → 403; grant but no channel → `delivered: 0`; with linked channel → enqueues; muted → silent zero.
- **`telegram-link.test.ts`** — `/start <valid token>` writes channels row; `/start <expired>` errors; `/start` (no arg) responds with welcome.
- **`ratelimit.test.ts`** — under limit allowed; over limit denied; window resets after TTL.

Mock outbound HTTP (Telegram, AppView profile fetch, PLC) — don't hit the network in tests.

---

## Root `package.json` scripts

- `pnpm dev` → starts `wrangler dev` in `apps/relay`
- `pnpm build` → builds all workspaces
- `pnpm test` → vitest across all workspaces
- `pnpm generate` → runs `@atcute/lex-cli` in `packages/lexicons` to regenerate types
- `pnpm db:migrate` → `wrangler d1 migrations apply notifs-relay` for the relay
- `pnpm typecheck` → `tsc -b`

---

## README content (root)

Include sections for:

1. **What this is** — one-paragraph summary.
2. **Repo layout** — the tree above.
3. **Configuration** — list every place `notifs.atmo.tools` / `did:web:notifs.atmo.tools` / `tools.atmo.notifs` appears, so a future find-replace is straightforward.
4. **Local setup** — `pnpm install`, `pnpm generate`, create D1, create KV, create Queues, copy `wrangler.toml` and fill in IDs.
5. **Telegram bot setup** — message @BotFather, get a token, set commands, run `wrangler secret put TELEGRAM_BOT_TOKEN`, generate a webhook secret with `openssl rand -hex 32`, `wrangler secret put TELEGRAM_WEBHOOK_SECRET`, register webhook with a curl one-liner.
6. **Deploying** — `wrangler deploy`, add the custom domain in CF dashboard, verify `/.well-known/did.json` returns the expected JSON.
7. **For sender developers** — how to set up a `did:web` for your own app, how to sign service-auth JWTs (link to atcute's `createServiceJwt`), example call to `tools.atmo.notifs.requestPermission` and `tools.atmo.notifs.send`.

---

## What to do, what not to do

**Do**:

- Strict TypeScript everywhere, no `any` except at boundaries where you also write a runtime check.
- Use named exports, not default, for everything except the Worker entry.
- Parameterised D1 queries, always.
- Throw `XRPCError` subclasses, never return ad-hoc error JSON.
- Comment any non-obvious business logic (especially the rate-limit semantics).

**Don't**:

- Don't add libraries beyond the stack listed above without a clear reason.
- Don't try to use `@atcute/xrpc-server-cloudflare` — it's only for WebSocket subscriptions, which this project doesn't use.
- Don't write a `verificationMethod` block into the DID doc — the relay doesn't sign and doesn't need a key.
- Don't add Jetstream consumers, repo records, or anything else atproto-data-plane — this relay is pure XRPC.
- Don't write the SvelteKit website code — `apps/web` is a placeholder for a follow-up prompt.

When in doubt about scope: implement the smallest thing that makes the integration tests pass, then stop.
