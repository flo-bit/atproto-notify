// Response shapes for the relay's dual-auth routing/inbox methods. Kept out of
// `$lib/server` so the component can import them too. A real integrator would
// likely codegen these from the published lexicons; hand-typing keeps the demo
// dependency-light.
//
// A route is a `+`-joined set of channel tokens (e.g. 'push+telegram'), 'off'
// (drop), or 'inbox' (record only). App-wide routes add the inherit sentinel
// 'default'; per-category routes add 'app'. See $lib/routes for helpers.

/** A concrete route: a channel-token set, or 'off' / 'inbox'. */
export type AlertRoute = string;
/** App-wide route; 'default' inherits the user's account default. */
export type AppRoute = string;
/** Per-category route; 'app' inherits the app-wide route. */
export type CategoryRoute = string;

/** A user delivery target, with a privacy-safe label (no raw email/handle). */
export interface RoutingTarget {
	type: string;
	id: string;
	label: string;
}

export interface RoutingCategory {
	id: string;
	title?: string;
	description?: string;
	route: CategoryRoute;
}

export interface RoutingView {
	/** App-wide route for everything from this app. */
	route: AppRoute;
	/** The user's account default (what 'default' resolves to). */
	defaultRoute: AlertRoute;
	categories: RoutingCategory[];
	/** The user's deliverable targets, so we can show which channels are usable. */
	targets: RoutingTarget[];
}

export interface NotificationView {
	id: string;
	title: string;
	body: string;
	uri?: string;
	category?: string;
	createdAt: string;
	read: boolean;
	/** Number of channels this notification fanned out to (0 = recorded only). */
	delivered?: number;
}
