import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

// Signed-in users skip the landing and go straight to the dashboard — including
// right after the OAuth callback returns to `/`.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.did) {
		redirect(303, '/dashboard');
	}
};
