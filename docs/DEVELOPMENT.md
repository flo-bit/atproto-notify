# Development

Running, configuring, and deploying the `atmo.pub` monorepo (relay, web
dashboard, example sender). For the high-level overview see
[README.md](README.md); for the sender API see https://atmo.pub/docs.

## Repo layout

```
.
├── package.json                  # workspace root, scripts
├── pnpm-workspace.yaml           # apps/* and packages/*
├── tsconfig.base.json            # shared strict config
├── tsconfig.json                 # references for `tsc -b`
├── apps/
│   ├── relay/
│   │   ├── wrangler.toml
│   │   ├── vitest.config.ts
│   │   ├── migrations/           # 0001_init.sql (consolidated canonical schema)
│   │   ├── src/
│   │   │   ├── index.ts          # default export { fetch, queue, scheduled }
│   │   │   ├── env.ts            # Env + DispatchJob + AppContext types
│   │   │   ├── router.ts         # builds the XRPCRouter, wires handlers
│   │   │   ├── auth/             # verifier.ts, sender.ts, user.ts
│   │   │   ├── xrpc/             # one file per procedure/query
│   │   │   ├── delivery/         # dispatcher.ts (queue consumer) + one module per channel
│   │   │   │                     #   (webpush, telegram, email, bluesky-dm, webhook) + channel/limits
│   │   │   ├── telegram/         # webhook.ts, commands.ts, callbacks.ts
│   │   │   ├── db/               # queries.ts (schema: migrations/0001_init.sql)
│   │   │   ├── identity/resolve.ts
│   │   │   ├── profile/fetch.ts
│   │   │   ├── ratelimit.ts
│   │   │   ├── well-known.ts
│   │   │   └── lib/              # errors.ts, ids.ts, time.ts
│   │   └── test/                 # vitest (pool-workers)
│   ├── web/                      # SvelteKit dashboard (atmo.pub)
│   │   ├── wrangler.jsonc
│   │   ├── svelte.config.js      # adapter-cloudflare
│   │   ├── vite.config.ts        # workerd resolve conditions (see "Deploying the SvelteKit apps")
│   │   └── src/
│   │       ├── hooks.server.ts   # = atproto.handle (@svelte-atproto/oauth)
│   │       ├── lib/atproto/      # OAuth client config + oauth.remote.ts (login/logout)
│   │       ├── lib/server/relay.ts   # calls the relay as the signed-in user
│   │       └── routes/           # (app)/ dashboard: apps, settings, inbox
│   ├── homepage/                 # marketing landing + developer docs (docs.atmo.pub)
│   │   └── static/llms.txt       # LLM-oriented integration guide
│   └── example-sender/           # one-page sender demo (example.atmo.pub)
│       ├── wrangler.jsonc
│       ├── scripts/generate-keys.js  # P-256 keypair for `send` (sender:keygen)
│       └── src/
│           ├── lib/server/       # relay.ts, sender-auth.ts (mints sender JWTs)
│           ├── lib/relay.remote.ts   # requestNotifications + sendTest commands
│           └── routes/
│               ├── +page.svelte
│               └── .well-known/did.json/+server.ts   # this app's did:web
└── packages/
    └── lexicons/
        ├── lex.config.js         # @atcute/lex-cli config
        ├── lexicons/pub/atmo/notify/*.json   # 13 lexicons
        └── src/index.ts          # re-exports generated types
```

## Local setup

Requires **Node 22+** and **pnpm 11** (`corepack prepare pnpm@11 --activate`).

```sh
pnpm install
pnpm generate          # generate lexicon types into packages/lexicons/src/lexicons/
pnpm typecheck         # tsc -b across the workspace
pnpm test              # vitest (runs in the Workers runtime via miniflare)
```

Create the Cloudflare resources, then paste the ids into `apps/relay/wrangler.toml`
(replace each `REPLACE_ME`):

```sh
# from apps/relay/
pnpm exec wrangler d1 create notifs-relay          # -> database_id
pnpm exec wrangler kv namespace create CACHE       # -> id
pnpm exec wrangler queues create notifs-dispatch
```

Apply migrations (locally and/or remotely):

```sh
pnpm db:migrate                 # remote
# or, for local dev state:
pnpm exec wrangler d1 migrations apply notifs-relay --local
```

Run the worker locally:

```sh
pnpm dev                        # wrangler dev in apps/relay
```

The SvelteKit apps run on their own dev servers. Each needs local OAuth secrets
in a gitignored `.env` first (`atproto:setup` generates them):

```sh
pnpm --filter web atproto:setup && pnpm --filter web dev
pnpm --filter example atproto:setup && pnpm --filter example dev
```

> Local dev uses a loopback OAuth client (no `ORIGIN`), so the confidential-client
> path that only runs on a real domain isn't exercised. To test that locally,
> point a `cloudflared` tunnel at the dev server and set `ORIGIN` to the tunnel
> URL (the apps' `vite.config.ts` already allows `*.trycloudflare.com` hosts).

### Useful scripts (root)

| Script | Action |
| --- | --- |
| `pnpm dev` | `wrangler dev` in `apps/relay` |
| `pnpm build` | builds all workspaces (`pnpm -r build`) |
| `pnpm test` | vitest across workspaces |
| `pnpm generate` | regenerate lexicon types with `@atcute/lex-cli` |
| `pnpm db:migrate` | `wrangler d1 migrations apply notifs-relay` |
| `pnpm typecheck` | `tsc -b` |

## Configuration

These values are baked into the code/config in several places. To rebrand or
re-home the relay, change them everywhere listed below.

| Constant | Value | Where it lives |
| --- | --- | --- |
| Relay domain | `relay.atmo.pub` | `apps/relay/wrangler.toml` (`routes`, derived `RELAY_DID`); `apps/relay/test/helpers.ts` |
| Relay DID | `did:web:relay.atmo.pub` | `apps/relay/wrangler.toml` (`[vars].RELAY_DID`); consumed by `apps/relay/src/auth/verifier.ts` and `apps/relay/src/well-known.ts` (service endpoint derived from it); `apps/relay/test/helpers.ts` (`RELAY_DID`) |
| Dashboard (web) domain | `atmo.pub` | `apps/web/wrangler.jsonc` (`ORIGIN`); the relay's Telegram messages in `apps/relay/src/telegram/commands.ts` (`DASHBOARD_URL`, `NOT_LINKED`); `apps/example-sender/src/lib/config.ts` (`DASHBOARD_ORIGIN`) |
| Relay service id | `#notif_relay` | `apps/relay/src/well-known.ts` (DID-doc `service[].id`); `apps/relay/src/auth/verifier.ts` (`acceptAudiences` fragment) |
| Lexicon NSID prefix | `pub.atmo.notify` | Every file under `packages/lexicons/lexicons/` (each `id`); regenerated types under `packages/lexicons/src/lexicons/`; the `LXM` constant in every `apps/relay/src/xrpc/*.ts`; the map + imports in `apps/relay/src/well-known.ts` |
| Pending request TTL | 7 days | `apps/relay/src/xrpc/requestPermission.ts` (`addDays(createdAt, 7)`) |
| Link token TTL | 10 minutes | `apps/relay/src/xrpc/linkChannel.ts` (`addMinutes(now(), 10)`) |
| DID-doc cache TTL (KV) | 5 minutes | `apps/relay/src/identity/resolve.ts` (`DID_DOC_CACHE_TTL_SECONDS`) |
| Profile cache TTL (`senders`) | 24 hours | `apps/relay/src/profile/fetch.ts` (`PROFILE_TTL_MS`) |
| `requestPermission` rate limits | 50 / hour / recipient & 100 / hour / sender | `apps/relay/src/xrpc/requestPermission.ts` (`PER_RECIPIENT_LIMIT`, `PER_SENDER_LIMIT`, `WINDOW_SECONDS`) |
| `send` rate limits | 1 / sec & 100 / day / pair | `apps/relay/src/xrpc/send.ts` (`PER_SECOND_*`, `PER_DAY_*`) |
| Bot username | `atmo_notify_bot` | `apps/relay/wrangler.toml` (`[vars].BOT_USERNAME`) → deep links in `linkChannel` |

> **Auth model:** `requestPermission` is **user-authenticated** (the user OAuths
> into the requesting app, granting the relay's `requestPermission` rpc scope);
> the sender DID + display metadata are in the request body. `send` stays
> **sender-authenticated** (the sender's own DID key). See "For sender developers".

> **Note on `lex.config.js`** — the prompt's tree named this `lex.config.json`,
> but `@atcute/lex-cli` loads its config via dynamic `import()`, which only
> resolves `lex.config.js`/`.ts`. We use `.js` so `pnpm generate` works without
> extra Node flags.

## Telegram bot setup

1. Message [@BotFather](https://t.me/BotFather), `/newbot`, and note the **bot
   token** and **username**. Put the username in `wrangler.toml` `[vars].BOT_USERNAME`.
2. (Optional) Set the command list with BotFather's `/setcommands`:
   ```
   start - Link your account
   list - List authorized apps
   revoke - Revoke an app
   settings - Notification settings
   ```
3. Store the bot token as a secret:
   ```sh
   pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
   ```
4. Generate and store a webhook secret (it becomes the last path segment of the
   webhook URL, so attackers can't post fake updates):
   ```sh
   openssl rand -hex 32                          # copy the output
   pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET
   ```
5. Register the webhook with Telegram (after deploying, so the URL resolves):
   ```sh
   BOT_TOKEN="123:abc"
   WEBHOOK_SECRET="<the hex you generated>"
   curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
     -H 'content-type: application/json' \
     -d "{\"url\":\"https://relay.atmo.pub/telegram/webhook/${WEBHOOK_SECRET}\"}"
   ```

## Deploying the relay

```sh
# from apps/relay/
pnpm exec wrangler deploy
```

Then:

1. In the Cloudflare dashboard, attach the **custom domain** `relay.atmo.pub`
   to the Worker (Workers & Pages → the worker → Settings → Domains & Routes).
   The `routes` entry in `wrangler.toml` already declares it as a custom domain.
2. Verify the DID document resolves:
   ```sh
   curl -s https://relay.atmo.pub/.well-known/did.json
   ```
   Expected:
   ```json
   {
     "@context": ["https://www.w3.org/ns/did/v1"],
     "id": "did:web:relay.atmo.pub",
     "service": [
       {
         "id": "#notif_relay",
         "type": "AtprotoNotificationRelay",
         "serviceEndpoint": "https://relay.atmo.pub"
       }
     ]
   }
   ```
3. Health check: `curl -s https://relay.atmo.pub/xrpc/_health` → `{"status":"ok"}`.
4. Lexicons are served at `https://relay.atmo.pub/lexicons/<nsid>`.

## Deploying the SvelteKit apps (web + example sender)

Both `apps/web` and `apps/example-sender` are SvelteKit apps on Cloudflare Workers
(`@sveltejs/adapter-cloudflare`). They use `@svelte-atproto/oauth` for atproto
OAuth and run reads via `+page.server.ts` load functions and writes via remote
`command`s.

```sh
# from apps/web (same shape for apps/example-sender)
pnpm exec wrangler kv namespace create OAUTH_SESSIONS   # paste id into wrangler.jsonc
pnpm exec wrangler kv namespace create OAUTH_STATES

pnpm exec atproto-oauth secret | pnpm exec wrangler secret put COOKIE_SECRET
pnpm exec atproto-oauth keygen | pnpm exec wrangler secret put CLIENT_ASSERTION_KEY

pnpm run deploy        # vite build && wrangler deploy
```

Then attach the custom domain in the Cloudflare dashboard (`atmo.pub` for
web, `example.atmo.pub` for the example) and make sure `ORIGIN` in
`wrangler.jsonc` matches it — OAuth `client_id`/`redirect_uri` derive from it.

The example sender also needs a sender keypair for `send` — see
[`apps/example-sender/README.md`](apps/example-sender/README.md).

> **Cloudflare/workerd build note.** `vite.config.ts` in both apps sets
> `ssr.resolve.conditions: ['workerd', 'import', 'module', 'default']`. Without it
> the SSR build resolves the **`node`** export condition of `@atcute/*` packages,
> whose Node base64 build calls `Buffer.prototype.base64urlSlice` with no offset —
> which `workerd`'s `nodejs_compat` rejects (`The "start" argument must be of type
> number`), breaking OAuth sign-in **only once deployed**. The `workerd` condition
> selects the Buffer-free Web builds. Don't add `browser` to the list (it makes
> other deps pull browser builds that reference `window`).

## For sender developers

The user-facing version of this section lives at https://atmo.pub/docs,
and a complete working implementation is in
[`apps/example-sender`](apps/example-sender). The essentials:

**Two endpoints, two different auth mechanisms:**

- **`requestPermission`** proves *the user authorized this request* — it's
  authenticated by the **user** (via OAuth into your app, granting the
  `requestPermission` rpc scope; see below). The sender DID and display info are
  passed in the body.
- **`send`** proves *the sender identity* — it's authenticated by **your app's
  DID** (a service-auth JWT signed with your app's key).

1. **Set up a `did:web` (or `did:plc`) for your app** with an atproto signing key
   (needed for `send`). For `did:web:yourapp.example`, host a DID document at
   `https://yourapp.example/.well-known/did.json` containing a
   `verificationMethod` whose id ends in `#atproto` (a `Multikey` with your public
   key in `publicKeyMultibase`). The relay resolves plc + web DIDs.

2. **Request permission** — the user signs into your app via atproto OAuth. Your
   app's scope needs only `requestPermission` (`send` uses your app's own key, not
   the user's session):

   ```
   atproto rpc?lxm=pub.atmo.notify.requestPermission&aud=*
   ```

   Then, on the user's PDS, mint a service-auth JWT via
   `com.atproto.server.getServiceAuth` (`aud = did:web:relay.atmo.pub`,
   `lxm = pub.atmo.notify.requestPermission`) and call:

   ```ts
   await fetch('https://relay.atmo.pub/xrpc/pub.atmo.notify.requestPermission', {
     method: 'POST',
     headers: {
       authorization: `Bearer ${userServiceAuthJwt}`, // issued by the USER's PDS
       'content-type': 'application/json',
     },
     body: JSON.stringify({
       senderDid: 'did:web:yourapp.example', // what the user approves & what `send` uses
       title: 'Bookhive',                    // shown to the user at approval
       description: 'New comments on your books',
       iconUrl: 'https://yourapp.example/icon.png',
     }),
   });
   // -> { id, status: "pending" | "alreadyGranted" }
   ```

   The user approves it in the dashboard or Telegram.

3. **Send a notification** once granted — authenticated with **your app's own
   key** (`aud` = the relay, `lxm = pub.atmo.notify.send`):

   ```ts
   import { P256PrivateKeyExportable } from '@atcute/crypto';
   import { createServiceJwt } from '@atcute/xrpc-server/auth';

   const keypair = await P256PrivateKeyExportable.importRaw(yourPrivateKeyBytes);
   const jwt = await createServiceJwt({
     keypair,
     issuer: 'did:web:yourapp.example',
     audience: 'did:web:relay.atmo.pub',
     lxm: 'pub.atmo.notify.send',
     expiresIn: 60,
   });

   await fetch('https://relay.atmo.pub/xrpc/pub.atmo.notify.send', {
     method: 'POST',
     headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
     body: JSON.stringify({
       recipient: 'did:plc:therecipient',
       title: 'New reply',
       body: 'alice replied to your post',
       uri: 'https://yourapp.example/thread/123',
     }),
   });
   // -> { id, delivered }   (delivered = number of channels dispatched to)
   ```

   `send` returns `403 NotAuthorized` if there is no grant, and `429
   RateLimitExceeded` (with `Retry-After`) when limits are hit. A muted grant is
   accepted silently with `delivered: 0`.
