import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: { host: '127.0.0.1' },
	plugins: [tailwindcss(), sveltekit()]
});
