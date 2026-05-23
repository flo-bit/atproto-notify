# notify.atmo.tools

Notifications for the AT Protocol. Any atproto app can ask a user for permission
to notify them; the user approves which apps may notify them in a web dashboard,
and deliveries go out (v1) through a Telegram bot.

- **Dashboard** — sign in, approve apps, link Telegram: https://notify.atmo.tools
- **Developer docs**: https://notify.atmo.tools/docs
- **Live example sender**: https://example.notify.atmo.tools · [source](apps/example-sender)
- **Relay API + `did:web`**: https://notifs.atmo.tools

> `notify.atmo.tools` is the dashboard; `notifs.atmo.tools` (with an "s") is the
> relay XRPC API. User-facing links point at `notify.atmo.tools`.

## Sending notifications from your app

Two endpoints, two auth mechanisms:

- **`requestPermission`** — authenticated by the **user** (atproto OAuth into your
  app). Names your app as the sender; the user approves it.
- **`send`** — authenticated by **your app's own DID key**. Delivers to a user who
  has granted you permission.

Full walkthrough with code is at **https://notify.atmo.tools/docs**, and
[`apps/example-sender`](apps/example-sender) is a complete, ~300-line reference
implementation of both flows (live at https://example.notify.atmo.tools).

## This repo

- **`apps/relay`** — the Cloudflare Worker at `notifs.atmo.tools`. Pure XRPC: it
  verifies inbound service-auth JWTs, stores grants / pending requests / channels
  in D1, rate-limits with KV, and dispatches deliveries through a Cloudflare Queue.
  No firehose, no repo records, no signing.
- **`apps/web`** — the SvelteKit dashboard at `notify.atmo.tools` (+ `/docs`).
- **`apps/example-sender`** — one-page sender demo at `example.notify.atmo.tools`.
- **`apps/mobile`** — the iOS + Android app (Expo / React Native): inbox, apps,
  requests, settings, push. See [`apps/mobile/README.md`](apps/mobile/README.md).
- **`packages/lexicons`** — the shared `tools.atmo.notifs.*` lexicons (15) and
  generated types.

Running, configuring, and deploying everything: **[DEVELOPMENT.md](DEVELOPMENT.md)**.
