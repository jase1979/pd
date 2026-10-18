import { levels, units } from '$lib/server/site';

export const load = () => ({
	levels: levels.map((level) => ({
		...level,
		units: units.filter((u) => u.level === level.id).map(({ label, url }) => ({ label, url }))
	}))
});
