# Run your own relay

Want notifications for your own app(s) without depending on atmo.pub? Run the
relay yourself. You get web push, Telegram, email, Bluesky DM, webhooks, an inbox,
and per-app/category routing — for whatever apps you register. **It runs on
Cloudflare Workers** (D1 +
KV + Queues); that's the only supported target for now.

For deeper details see [DEVELOPMENT.md](DEVELOPMENT.md).

## Prerequisites

- A Cloudflare account (Workers paid plan — Queues require it).
- A domain in that account for the relay, e.g. `relay.yourapp.example`.
- Node 20+ and `pnpm`.

## Steps

1. **Clone & install**
   ```bash
   git clone <this repo> && cd atproto-notifs && pnpm install
   cd apps/relay
   ```

2. **Create the Cloudflare resources**, then paste the IDs into `wrangler.toml`:
   ```bash
   pnpm exec wrangler d1 create notifs-relay          # → database_id
   pnpm exec wrangler kv namespace create CACHE        # → kv id
   pnpm exec wrangler queues create notifs-dispatch
   ```

3. **Set your domain** in `wrangler.toml`:
   ```toml
   routes   = [{ pattern = "relay.yourapp.example", custom_domain = true }]
   [vars]
   RELAY_DID = "did:web:relay.yourapp.example"   # must match the domain
   ```
   The relay serves its `did:web` doc at `/.well-known/did.json`, derived from
   `RELAY_DID`.

4. **Generate keys**
   ```bash
   pnpm relay:keygen   # prints a private + public multikey for signing callbacks
   pnpm vapid:keygen   # prints VAPID keys for web push
   ```
   - Put the relay **public** multikey into `RELAY_PUBLIC_KEY_MULTIBASE` in
     `src/well-known.ts` (it must match the private key from the same run).
   - Put `VAPID_PUBLIC_KEY` + `VAPID_SUBJECT` (a `mailto:`) in `wrangler.toml [vars]`.

5. **Set secrets**
   ```bash
   pnpm exec wrangler secret put RELAY_PRIVATE_KEY     # from relay:keygen
   pnpm exec wrangler secret put VAPID_PRIVATE_JWK     # from vapid:keygen
   # Telegram (optional — skip if you only want web push):
   pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
   pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET
   # Email (optional — via comail.at):
   pnpm exec wrangler secret put COMAIL_API_KEY        # atmos_… from comail.at
   ```
   If you use Telegram, also set `BOT_USERNAME` in `[vars]`. If you use email, set
   `COMAIL_DID` (the account DID for the `X-Atmos-DID` header) and `COMAIL_FROM` (an
   enrolled sender address) in `[vars]`; the `EMAIL_DAILY_*` caps there default to
   10 / recipient / day and 100 global / day — keep them under your comail plan.
   Bluesky DM and webhook channels need no extra config (DM uses the relay's own
   identity; webhooks are user-supplied URLs).

6. **Apply migrations & deploy**
   ```bash
   pnpm db:migrate     # applies migrations to the remote D1
   pnpm run deploy
   ```

7. **Verify**
   ```bash
   curl https://relay.yourapp.example/.well-known/did.json   # your did:web doc
   curl https://relay.yourapp.example/xrpc/_health           # {"status":"ok"}
   ```

## Register your app(s)

Edit `src/lib/apps.ts` — list each app that integrates with your relay:

```ts
export const APPS: readonly RegisteredApp[] = [
  {
    did: 'did:web:yourapp.example',
    title: 'Your App',
    callbackUrl: 'https://yourapp.example', // for subscriberChanged (optional)
    trusted: true,   // auto-approve permission requests (skip the pending step)
    manage: 'full',  // relay-wide management designation (optional)
  },
];
```

Then redeploy. For a single-app relay this is usually just your one app.

## Sending from your app

Your sender authenticates with its own DID key, addressed to **your** relay:

- `aud` = your `RELAY_DID`, endpoint = `https://relay.yourapp.example`
- call `pub.atmo.notify.requestPermission` then `pub.atmo.notify.send`

`apps/example-sender` is a complete reference — copy its `src/lib/server/` auth +
relay code and point `RELAY_ORIGIN`/`RELAY_DID` at your relay.

## Notes

- The relay serves **any** app a user grants. To hard-restrict it to only your
  DID, gate `requestPermission`/`send` on your sender DID (a few lines in
  `src/xrpc/`).
- A user can still *also* use atmo.pub (or another relay) for other channels —
  your app just sends to each relay the user uses. Relays are independent.
