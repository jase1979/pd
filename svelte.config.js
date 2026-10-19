import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Static files skip the server code. Listing every file under /assets
		// individually goes over Cloudflare's 100-rule limit, so that whole
		// folder is excluded with one rule instead.
		adapter: adapter({
			routes: { include: ['/*'], exclude: ['<build>', '<prerendered>', '/assets/*'] }
		}),
		// Every page is prerendered to static HTML at build time; the crawler
		// fails the build if any internal link points at a page that doesn't exist.
		prerender: {
			handleHttpError: 'fail',
			handleMissingId: 'fail'
		}
	}
};

export default config;
