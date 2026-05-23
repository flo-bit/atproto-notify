import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

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
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	if (locals.did) redirect(302, returnTo);
	return { returnTo };
};
