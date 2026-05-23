# atmo notifications relay

A Cloudflare Workers service that lets any AT Protocol app send notifications to
its users. A user approves which apps may notify them (via a separate SvelteKit
website, built later), and delivery in v1 happens through a Telegram bot.

The relay is a pure XRPC service: it verifies service-auth JWTs, stores grants /
pending requests / channels in D1, rate-limits with KV, and dispatches deliveries
through a Cloudflare Queue. It does **not** read the atproto firehose, hold repo
records, or sign anything (it verifies inbound JWTs but never mints them).

This monorepo currently contains:

- **`packages/lexicons`** — the shared `tools.atmo.notifs.*` lexicons and their
  generated TypeScript types.
- **`apps/relay`** — the Cloudflare Worker.
- **`apps/web`** — placeholder for the SvelteKit dashboard (built in a follow-up).

---

## Configuration

These values are baked into the code/config in several places. To rebrand or
re-home the relay, change them everywhere listed below.

| Constant | Value | Where it lives |
| --- | --- | --- |
| Relay domain | `notifs.atmo.tools` | `apps/relay/wrangler.toml` (`routes`, derived `RELAY_DID`); dashboard links in `apps/relay/src/telegram/commands.ts` (`DASHBOARD_URL`, `NOT_LINKED`); `apps/relay/test/helpers.ts` |
| Relay DID | `did:web:notifs.atmo.tools` | `apps/relay/wrangler.toml` (`[vars].RELAY_DID`); consumed by `apps/relay/src/auth/verifier.ts` and `apps/relay/src/well-known.ts` (service endpoint derived from it); `apps/relay/test/helpers.ts` (`RELAY_DID`) |
| Relay service id | `#notif_relay` | `apps/relay/src/well-known.ts` (DID-doc `service[].id`); `apps/relay/src/auth/verifier.ts` (`acceptAudiences` fragment) |
| Lexicon NSID prefix | `tools.atmo.notifs` | Every file under `packages/lexicons/lexicons/` (each `id`); regenerated types under `packages/lexicons/src/lexicons/`; the `LXM` constant in every `apps/relay/src/xrpc/*.ts`; the map + imports in `apps/relay/src/well-known.ts`; the permission-set `lxm` arrays |
| Pending request TTL | 7 days | `apps/relay/src/xrpc/requestPermission.ts` (`addDays(createdAt, 7)`) |
| Link token TTL | 10 minutes | `apps/relay/src/xrpc/linkChannel.ts` (`addMinutes(now(), 10)`) |
| DID-doc cache TTL (KV) | 5 minutes | `apps/relay/src/identity/resolve.ts` (`DID_DOC_CACHE_TTL_SECONDS`) |
| Profile cache TTL (`senders`) | 24 hours | `apps/relay/src/profile/fetch.ts` (`PROFILE_TTL_MS`) |
| `requestPermission` rate limit | 100 / hour / sender | `apps/relay/src/xrpc/requestPermission.ts` (`REQ_LIMIT`, `REQ_WINDOW_SECONDS`) |
| `send` rate limits | 1 / sec & 100 / day / pair | `apps/relay/src/xrpc/send.ts` (`PER_SECOND_*`, `PER_DAY_*`) |
| Bot username | `REPLACE_ME` | `apps/relay/wrangler.toml` (`[vars].BOT_USERNAME`) → deep links in `linkChannel` |

> **Note on `lex.config.js`** — the prompt's tree named this `lex.config.json`,
> but `@atcute/lex-cli` loads its config via dynamic `import()`, which only
> resolves `lex.config.js`/`.ts`. We use `.js` so `pnpm generate` works without
> extra Node flags.

---

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
│   │   ├── migrations/0001_init.sql
│   │   ├── src/
│   │   │   ├── index.ts          # default export { fetch, queue, scheduled }
│   │   │   ├── env.ts            # Env + DispatchJob + AppContext types
│   │   │   ├── router.ts         # builds the XRPCRouter, wires handlers
│   │   │   ├── auth/             # verifier.ts, sender.ts, user.ts
│   │   │   ├── xrpc/             # one file per procedure/query
│   │   │   ├── delivery/         # telegram.ts (API), dispatcher.ts (queue consumer)
│   │   │   ├── telegram/         # webhook.ts, commands.ts, callbacks.ts
│   │   │   ├── db/               # schema.sql, queries.ts
│   │   │   ├── identity/resolve.ts
│   │   │   ├── profile/fetch.ts
│   │   │   ├── ratelimit.ts
│   │   │   ├── well-known.ts
│   │   │   └── lib/              # errors.ts, ids.ts, time.ts
│   │   └── test/                 # vitest (pool-workers)
│   └── web/                      # placeholder
└── packages/
    └── lexicons/
        ├── lex.config.js         # @atcute/lex-cli config
        ├── lexicons/tools/atmo/notifs/*.json   # 15 lexicons
        └── src/index.ts          # re-exports generated types
```

---

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

### Useful scripts (root)

| Script | Action |
| --- | --- |
| `pnpm dev` | `wrangler dev` in `apps/relay` |
| `pnpm build` | builds all workspaces (`pnpm -r build`) |
| `pnpm test` | vitest across workspaces |
| `pnpm generate` | regenerate lexicon types with `@atcute/lex-cli` |
| `pnpm db:migrate` | `wrangler d1 migrations apply notifs-relay` |
| `pnpm typecheck` | `tsc -b` |

---

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
     -d "{\"url\":\"https://notifs.atmo.tools/telegram/webhook/${WEBHOOK_SECRET}\"}"
   ```

---

## Deploying

```sh
# from apps/relay/
pnpm exec wrangler deploy
```

Then:

1. In the Cloudflare dashboard, attach the **custom domain** `notifs.atmo.tools`
   to the Worker (Workers & Pages → the worker → Settings → Domains & Routes).
   The `routes` entry in `wrangler.toml` already declares it as a custom domain.
2. Verify the DID document resolves:
   ```sh
   curl -s https://notifs.atmo.tools/.well-known/did.json
   ```
   Expected:
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
3. Health check: `curl -s https://notifs.atmo.tools/xrpc/_health` → `{"status":"ok"}`.
4. Lexicons are served at `https://notifs.atmo.tools/lexicons/<nsid>`.

---

## For sender developers

To send notifications from your own app you authenticate as **your app's DID**
using atproto service-auth JWTs. There is no registration step — the relay
verifies your signature against your DID document.

1. **Set up a `did:web` (or `did:plc`) for your app** with an atproto signing key.
   For `did:web:yourapp.example`, host a DID document at
   `https://yourapp.example/.well-known/did.json` containing a
   `verificationMethod` whose id ends in `#atproto` (a `Multikey` with your
   public key in `publicKeyMultibase`). The relay resolves plc + web DIDs.

2. **Mint a service-auth JWT** for each call. The `aud` must be the relay
   (`did:web:notifs.atmo.tools` or `did:web:notifs.atmo.tools#notif_relay`) and
   the `lxm` must match the method you're calling. Use atcute's
   [`createServiceJwt`](https://www.npmjs.com/package/@atcute/xrpc-server):

   ```ts
   import { P256PrivateKeyExportable } from '@atcute/crypto';
   import { createServiceJwt } from '@atcute/xrpc-server/auth';

   const keypair = await P256PrivateKeyExportable.importRaw(yourPrivateKeyBytes);

   async function jwt(lxm: string) {
     return createServiceJwt({
       keypair,
       issuer: 'did:web:yourapp.example',
       audience: 'did:web:notifs.atmo.tools',
       lxm,
       expiresIn: 60,
     });
   }
   ```

3. **Request permission** (the user approves it in the dashboard or Telegram):

   ```ts
   await fetch('https://notifs.atmo.tools/xrpc/tools.atmo.notifs.requestPermission', {
     method: 'POST',
     headers: {
       authorization: `Bearer ${await jwt('tools.atmo.notifs.requestPermission')}`,
       'content-type': 'application/json',
     },
     body: JSON.stringify({
       recipient: 'did:plc:therecipient',
       reason: 'Get notified when someone replies to you',
     }),
   });
   // -> { id, status: "pending" | "alreadyGranted" }
   ```

4. **Send a notification** once granted:

   ```ts
   await fetch('https://notifs.atmo.tools/xrpc/tools.atmo.notifs.send', {
     method: 'POST',
     headers: {
       authorization: `Bearer ${await jwt('tools.atmo.notifs.send')}`,
       'content-type': 'application/json',
     },
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

### Permission sets

The relay publishes two OAuth permission sets so the website can request scopes:

- `tools.atmo.notifs.authSender` — `requestPermission` + `send` (for apps).
- `tools.atmo.notifs.authUser` — all user-facing management methods (for the
  dashboard acting on a user's behalf).
