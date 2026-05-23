import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
		// Required for remote functions (enables `await` in components).
		experimental: {
			async: true
		}
	},
	kit: {
		// Cloudflare Workers (with static assets). The Worker output goes to
		// `.svelte-kit/cloudflare`, which `wrangler.jsonc` points `main`/`assets` at.
		adapter: adapter(),
		// Mutations are written as remote `command` functions.
		experimental: {
			remoteFunctions: true
		}
	}
};

export default config;
