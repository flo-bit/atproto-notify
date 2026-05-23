import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

// Signed-in users skip the login screen and go straight to the app — including
// right after the OAuth callback returns to `/`.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.did) {
		redirect(303, '/apps');
	}
};
