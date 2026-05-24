# atmo.pub

Notifications for the AT Protocol. Any atproto app can ask a user for permission
to notify them; the user approves which apps may notify them in a web dashboard
and chooses where alerts go — web push, Telegram, email, Bluesky DM, or a webhook
— while everything lands in an inbox.

- **Dashboard** — sign in, approve apps, connect channels: https://atmo.pub
- **Developer docs**: https://docs.atmo.pub/docs
- **Live example sender**: https://example.atmo.pub · [source](apps/example-sender)
- **Relay API + `did:web`**: https://relay.atmo.pub

> `atmo.pub` is the dashboard; `relay.atmo.pub` (with an "s") is the
> relay XRPC API. User-facing links point at `atmo.pub`.

## Sending notifications from your app

Two endpoints, two auth mechanisms:

- **`requestPermission`** — authenticated by the **user** (atproto OAuth into your
  app). Names your app as the sender; the user approves it.
- **`send`** — authenticated by **your app's own DID key**. Delivers to a user who
  has granted you permission.

Full walkthrough with code is at **https://docs.atmo.pub/docs**, and
[`apps/example-sender`](apps/example-sender) is a complete, ~300-line reference
implementation of both flows (live at https://example.atmo.pub).

## This repo

- **`apps/relay`** — the Cloudflare Worker at `relay.atmo.pub`. Pure XRPC: it
  verifies inbound service-auth JWTs; stores grants, pending requests, delivery
  targets, the inbox, and routing in D1; rate-limits with KV; and dispatches
  deliveries (web push, Telegram, email, Bluesky DM, webhook) through a Cloudflare
  Queue. No firehose, no repo records, no signing.
- **`apps/web`** — the SvelteKit dashboard at `atmo.pub`.
- **`apps/homepage`** — the marketing landing + developer docs at `docs.atmo.pub`.
- **`apps/example-sender`** — one-page sender demo at `example.atmo.pub`.
- **`packages/lexicons`** — the shared `pub.atmo.notify.*` lexicons and generated types.

Running, configuring, and deploying everything: **[DEVELOPMENT.md](docs/DEVELOPMENT.md)**.
Want notifications for your own app without depending on atmo.pub? Run the relay
yourself: **[SELF-HOSTING.md](docs/SELF-HOSTING.md)**.
