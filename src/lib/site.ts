// Site-wide constants shared by the layout and pages.
export const SITE_TITLE = 'WJEC Product Design Revision';

/** "Timber | WJEC Product Design Revision", as the Jekyll layout built it. */
export function pageTitle(title?: string): string {
	return title ? `${title} | ${SITE_TITLE}` : SITE_TITLE;
}
