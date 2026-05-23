import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { atproto } from '$lib/atproto';

const DEFAULT_RETURN_TO = '/demo/atproto';

function safeReturnTo(value: string | null | undefined): string {
	if (!value) return DEFAULT_RETURN_TO;
	try {
		const decoded = decodeURIComponent(value);
		if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded;
	} catch {}
	return DEFAULT_RETURN_TO;
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.did) redirect(302, safeReturnTo(url.searchParams.get('returnTo')));
	return { returnTo: safeReturnTo(url.searchParams.get('returnTo')) };
};

export const actions: Actions = {
	signIn: async ({ request }) => {
		const fd = await request.formData();
		const handle = fd.get('handle')?.toString().trim();
		const returnTo = safeReturnTo(fd.get('returnTo')?.toString());
		if (!handle) return fail(400, { message: 'Handle or DID is required' });

		try {
			const { url } = await atproto.api.startLogin({ handle, returnTo });
			redirect(303, url);
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e && 'location' in e) throw e;
			return fail(400, { message: e instanceof Error ? e.message : 'Sign-in failed' });
		}
	}
};
