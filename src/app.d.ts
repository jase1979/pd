declare global {
	namespace App {
		interface Platform {
			env: Record<string, never>;
		}
		// interface Locals {}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
