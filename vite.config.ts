import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { quizBank } from './src/lib/server/quiz/vite-plugin';

export default defineConfig({
	// quizBank() validates content/quizzes/*.yml and fails the build on any error.
	plugins: [quizBank(), sveltekit()],
	css: {
		preprocessorOptions: {
			// The partials still use Sass @import, which works but is deprecated.
			scss: { silenceDeprecations: ['import'] }
		}
	},
	// Content lives outside src/, so the dev server needs permission to read it.
	server: { fs: { allow: ['content'] } },
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
