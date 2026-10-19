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
				// Comma-separated addresses allowed to sign in as teachers. Unset == nobody.
				TEACHER_EMAILS?: string;
				// PBKDF2 hash of the teacher password (scripts/set-teacher-password.mjs).
				// Set == teachers sign in with a password; unset == by emailed link.
				TEACHER_PASSWORD_HASH?: string;
				// Sends teacher sign-in links. Unset == links are logged instead (dev).
				RESEND_API_KEY?: string;
				// The sender, on a domain verified with Resend, e.g. "PD Revision <revision@example.com>".
				MAIL_FROM?: string;
				// Local development only (ENVIRONMENT=dev): treat this address as signed in.
				DEV_TEACHER_EMAIL?: string;
			};
		}
		interface Locals {
			/** The logged-in student, resolved from the session cookie (API requests only). */
			student: import('$lib/server/students').Student | null;
			/** The signed-in teacher (API requests only). */
			teacher: import('$lib/server/teachers').Teacher | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
