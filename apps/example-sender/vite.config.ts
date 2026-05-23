import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// The worker build targets Cloudflare's workerd. @atcute/* packages ship a
	// "workerd" export condition pointing at Buffer-free builds; without it they
	// fall back to their "node" builds, which call Buffer.prototype.base64urlSlice
	// with no offset — rejected by workerd's nodejs_compat ("The start argument
	// must be of type number"), breaking OAuth PKCE/DPoP. Prefer "workerd" (and
	// drop "node") so those packages resolve their portable Web builds.
	ssr: { resolve: { conditions: ['workerd', 'import', 'module', 'default'] } },
	// allowedHosts lets a `cloudflared` quick tunnel reach the dev server, so the
	// confidential-client OAuth path (ORIGIN set) can be tested locally.
	// Runs on 5174 so it can run alongside the web app (Vite's default 5173).
	// Keep in sync with `devPort` in src/lib/atproto/index.ts (the loopback OAuth client).
	server: { host: '127.0.0.1', port: 5174, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
	plugins: [tailwindcss(), sveltekit()]
});
