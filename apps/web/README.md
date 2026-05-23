# Atmo Notifs — website

The user-facing dashboard for the [atproto notifications relay](../relay). Users
sign in with Bluesky (atproto OAuth), approve/revoke which apps may notify them,
link Telegram, and manage settings. Built with SvelteKit + Tailwind v4.

> **Names are placeholders.** The product name (`PROJECT_NAME`) and footer repo
> link (`GITHUB_URL`) live in [`src/lib/config.ts`](src/lib/config.ts). Relay
> constants (domain, DID, scope) are in the same file.

## How it fits together

- **Auth** — provided by `@svelte-atproto/oauth` (scaffolded; do not modify
  `src/hooks.server.ts`, `src/app.d.ts`, or `src/lib/atproto/index.ts` beyond the
  OAuth scope). The hook populates `locals.did` / `locals.session` / `locals.client`.
- **Reads** — page `load` functions (`+page.server.ts`) call the relay in parallel.
- **Writes** — SvelteKit **remote functions** (`command`s in
  `src/lib/remote/notifs.remote.ts`); the page calls `invalidateAll()` after each.
- **Relay calls** — `src/lib/server/relay.ts` mints a per-request service-auth JWT
  via the user's PDS (`com.atproto.server.getServiceAuth`) and calls the relay.
  The JWT never reaches the browser.
- **Types** — request/response shapes come from the workspace package
  `@atmo/notifs-lexicons`.

Remote functions are enabled via `kit.experimental.remoteFunctions` +
`compilerOptions.experimental.async` in `svelte.config.js`.

## Routes

| Route                     | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `/`                       | Landing + "Sign in with Bluesky"                      |
| `/dashboard`              | Pending requests, granted apps, channels, settings    |
| `/dashboard/pending/[id]` | Deep-linkable single pending request (bot links here) |
| `/docs`                   | Developer docs for sending notifications              |

## Theming

Light/dark via semantic CSS variables in `src/routes/layout.css` (exposed to
Tailwind through `@theme inline`, so `bg-surface`, `text-muted`, etc. switch
automatically). Defaults to the OS preference; the header toggle overrides it
(persisted in `localStorage`, applied before paint by a small script in
`src/app.html` to avoid a flash).

## Local development

```sh
pnpm install
pnpm atproto:setup     # generates dev OAuth keys / .env (from @svelte-atproto)
pnpm dev
```

Set the env vars in `.env` (see `.env.example`): `ORIGIN`, `COOKIE_SECRET`,
`CLIENT_ASSERTION_KEY`. The relay must be reachable at the domain in
`src/lib/config.ts` (`notifs.atmo.tools`) for dashboard data to load — point it at
a local relay during development if needed.

```sh
pnpm check     # svelte-check (type check)
pnpm build     # production build
```

## Deployment (Cloudflare Workers)

Uses `@sveltejs/adapter-cloudflare` (Workers + static assets). Run these from
`apps/web/` in a Cloudflare-authenticated terminal.

1. **Pick the domain.** In `wrangler.jsonc`, set `name` and `vars.ORIGIN`
   (e.g. `https://notifs-web.atmo.tools`). `ORIGIN` must equal the served URL —
   the atproto OAuth `client_id` is derived from it.
2. **Create the KV namespaces** and paste the ids into `wrangler.jsonc`:
   ```sh
   pnpm exec wrangler kv namespace create OAUTH_SESSIONS
   pnpm exec wrangler kv namespace create OAUTH_STATES
   ```
3. **Set the secrets** (the `atproto-oauth` CLI generates them):
   ```sh
   pnpm exec atproto-oauth secret | pnpm exec wrangler secret put COOKIE_SECRET
   pnpm exec atproto-oauth keygen | pnpm exec wrangler secret put CLIENT_ASSERTION_KEY
   ```
4. **Deploy** (builds, then `wrangler deploy`):
   ```sh
   pnpm run deploy
   ```
5. **Bind the custom domain** in the CF dashboard (Workers → the worker →
   Settings → Domains & Routes), matching `ORIGIN`.

The OAuth client metadata is served dynamically by `@svelte-atproto/oauth` — no
static file to write. The dashboard needs the relay reachable at the domain in
`src/lib/config.ts` (`notifs.atmo.tools`), so deploy the relay too.
