// Shared by the teacher analysis endpoints: the quizzes a group's spec covers,
// and the group's history.

import { loadGroupHistory } from './history';
import { groupFor, listGroups } from './groups';
import { quizzes } from './quiz/bank';
import { quizMeta } from './quiz/core';
import { quizInfo } from './quiz/modes';
import type { Teacher } from './teachers';

/** The quizzes available here for a spec, as progress.ts describes them. */
export function quizzesForSpec(spec: string, environment: string) {
	return quizzes.filter((q) => q.spec === spec && quizMeta(q, environment).available).map((q) => quizInfo(q, environment));
}

/** A group the teacher can see, its quizzes and every student's history. */
export async function groupData(db: D1Database, teacher: Teacher, groupId: unknown, environment: string) {
	const group = await groupFor(db, teacher, groupId);
	const history = await loadGroupHistory(db, [group.id]);
	return { group, history, quizzes: quizzesForSpec(group.spec, environment) };
}

/** Every group the teacher can see, with all their students' history (for question health). */
export async function allGroupsData(db: D1Database, teacher: Teacher) {
	const groups = await listGroups(db, teacher);
	return loadGroupHistory(db, groups.map((g) => g.id));
}
