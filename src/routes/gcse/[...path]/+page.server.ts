// Unit pages (/gcse/unit2/) and topic pages (/gcse/unit2/timber/).

import { entriesUnder, loadUnitOrTopic } from '$lib/server/pages';
import type { EntryGenerator, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadUnitOrTopic(url.pathname);

// Tell the prerenderer about every page, not just the ones it finds by following links.
export const entries: EntryGenerator = () => entriesUnder('gcse');
