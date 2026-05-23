import { redirect } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';

// Everything under (app) requires a signed-in user. Send anonymous visitors to
// the login page.
export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.did) {
		redirect(303, '/');
	}
	return { did: locals.did };
};
