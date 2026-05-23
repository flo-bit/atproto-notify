import type { LayoutServerLoad } from './$types';

// Expose the signed-in DID to the whole app (header nav, landing banner).
export const load: LayoutServerLoad = ({ locals }) => {
	return { did: locals.did };
};
