import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Fully prerendered static site (see src/routes/+layout.ts). Output goes to
		// `build/`, served as Cloudflare Workers static assets (free — no Worker runs).
		adapter: adapter({ pages: 'build', assets: 'build', strict: true })
	}
};

export default config;
