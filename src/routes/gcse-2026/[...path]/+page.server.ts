// Unit and topic pages for the 2026 specification (/gcse-2026/unit1/core/energy/).

import { entriesUnder, loadUnitOrTopic } from '$lib/server/pages';
import type { EntryGenerator, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadUnitOrTopic(url.pathname);

export const entries: EntryGenerator = () => entriesUnder('gcse-2026');
