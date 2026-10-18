import { error } from '@sveltejs/kit';
import { levels, units } from '$lib/server/site';

export const load = () => {
	const level = levels.find((l) => l.id === 'gcse');
	if (!level) error(404);
	return { level, units: units.filter((u) => u.level === level.id) };
};
