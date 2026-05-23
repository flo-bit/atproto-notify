import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Login / mutations use SvelteKit remote functions (commands).
		experimental: { remoteFunctions: true },
		// Cloudflare Workers (static assets). Output goes to `.svelte-kit/cloudflare`.
		adapter: adapter()
	}
};

export default config;
