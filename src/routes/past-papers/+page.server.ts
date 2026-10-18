import { pastPapers } from '$lib/server/site';
import { renderMarkdown } from '$lib/server/markdown';

const md = (text: string) => (text ? renderMarkdown(text).html : '');

export const load = () => ({
	questions: pastPapers.map((q) => ({
		id: q.id,
		paper: q.paper,
		year: q.year,
		session: q.session,
		question_number: q.question_number,
		topic: q.topic,
		total_marks: q.total_marks,
		type: q.type,
		images: q.images,
		contextHtml: md(q.context),
		parts: q.parts.map((p) => ({
			label: p.label,
			marks: p.marks,
			questionHtml: md(p.question),
			answerHtml: md(p.answer)
		}))
	}))
});
