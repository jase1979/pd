import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// Every page is prerendered to static HTML at build time; the crawler
		// fails the build if any internal link points at a page that doesn't exist.
		prerender: {
			handleHttpError: 'fail',
			handleMissingId: 'fail'
		}
	}
};

export default config;
