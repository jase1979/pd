declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				// dev | preview | production. Decides whether draft questions are
				// served (see DRAFTS_SERVED_IN in lib/server/config.ts).
				ENVIRONMENT: string;
				// Signs anonymous quiz attempt tokens. Unset == the quiz API answers 500.
				QUIZ_SIGNING_SECRET?: string;
			};
		}
		// interface Locals {}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
