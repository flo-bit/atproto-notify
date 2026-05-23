# Atmo Notifs — example sender

A tiny reference app showing how any AT Protocol app sends notifications through
[Atmo Notifs](https://relay.atmo.pub). One page, two auth mechanisms.

## The two auth mechanisms

Atmo Notifs uses two auth paths:

- **`requestPermission`** requires **user-OAuth** — proves the *user* authorized
  the request. We mint a service-auth JWT on the user's PDS
  (`com.atproto.server.getServiceAuth`) and name this app's DID as the sender.
- **`send`** requires **sender-DID auth** — proves the call comes from the
  approved sender's private key. We sign the JWT with this app's own keypair.

Neither alone is sufficient; this demo wires up both.

## Where to look

- `src/lib/server/sender-auth.ts` — sender-DID JWT minting (for `send`)
- `src/lib/server/relay.ts` — both relay calls (`requestPermission`, `send`)
- `src/lib/relay.remote.ts` — the remote `command`s the page calls
- `src/lib/atproto/oauth.remote.ts` — login/logout (scaffolded)
- `src/routes/+page.svelte` — the single page
- `src/routes/.well-known/did.json/+server.ts` — this app's `did:web` document

## Setup

```sh
pnpm install
pnpm atproto:setup     # generates dev OAuth secrets in .env (COOKIE_SECRET, CLIENT_ASSERTION_KEY)
pnpm sender:keygen     # generates the P-256 keypair for `send`
```

From `sender:keygen`, copy the **public** multikey into `PUBLIC_KEY_MULTIBASE`
in `src/routes/.well-known/did.json/+server.ts`, and keep the **private** key for
the deploy secret.

```sh
pnpm dev               # local dev
```

## Deploy (Cloudflare Workers)

```sh
pnpm exec wrangler kv namespace create OAUTH_SESSIONS   # paste ids into wrangler.jsonc
pnpm exec wrangler kv namespace create OAUTH_STATES

pnpm exec atproto-oauth secret  | pnpm exec wrangler secret put COOKIE_SECRET
pnpm exec atproto-oauth keygen  | pnpm exec wrangler secret put CLIENT_ASSERTION_KEY
echo "<private-multikey-from-sender:keygen>" | pnpm exec wrangler secret put SENDER_PRIVATE_KEY

pnpm run deploy        # vite build && wrangler deploy
```

Set `name`/`vars.ORIGIN` in `wrangler.jsonc` to your domain, then bind it as a
custom domain. Verify `https://<domain>/.well-known/did.json` returns a document
with a non-placeholder `publicKeyMultibase`.

## OAuth scope

The app requests only `requestPermission` via the user's session — `send` uses
this app's own key, so it isn't in the OAuth scope. See `src/lib/config.ts`.
