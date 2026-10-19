<script lang="ts">
	// DRAFT wording, to be checked by the school's data protection officer
	// before the site is used with students.
	import { pageTitle } from '$lib/site';
</script>

<svelte:head>
	<title>{pageTitle('Privacy')}</title>
</svelte:head>

<div class="account-page privacy-page">
	<h1>How we use your information</h1>
	<p class="account-intro">For students using this revision site, and their parents and carers.</p>
	<p class="quiz-notice">This notice is a draft. It is being checked by the school before students start saving their work.</p>

	<h2>You don't have to log in</h2>
	<p>
		All of the revision notes and quizzes work without logging in. If you don't log in, your quiz answers are marked
		but nothing is saved.
	</p>

	<h2>What we store when you log in</h2>
	<ul>
		<li>Your <strong>username</strong>, which your teacher chose when they set up your class. We don't store your email, your date of birth or any other details about you.</li>
		<li>Your <strong>quiz answers</strong>, including "I don't know".</li>
		<li>Whether you said you were <strong>sure or guessing</strong> for each answer.</li>
		<li>Which <strong>revision notes pages</strong> you opened, and when.</li>
	</ul>
	<p>
		When you log in, the site also puts two small cookies in your browser so that it knows you're logged in. They are
		deleted when you log out, or when you close the browser unless you ticked "Remember me".
	</p>

	<h2>Why we store it</h2>
	<p>
		So that you can see your own progress, practise the questions you got wrong, and come back to topics at the right
		time; and so that your teachers can see which topics your class finds hard and help you with them. Your answers are
		marked automatically. They are never used for grades or reports.
	</p>

	<h2>Who can see it</h2>
	<p>
		<strong>You</strong>, and <strong>your teachers</strong>. Nobody else. We don't use advertising or tracking, and
		we don't share your information with anyone.
	</p>

	<h2>How long we keep it</h2>
	<p>
		Until the end of your course. Teachers delete each class, with all of its answers, once the course is over, and the
		site reminds them to do this after a year at the latest.
	</p>

	<h2>Asking for your information to be deleted</h2>
	<p>
		Ask your teacher. They can delete your account and all of your answers straight away. A parent or carer can also
		ask the school to do this.
	</p>
</div>
