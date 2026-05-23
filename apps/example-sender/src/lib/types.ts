// Response shapes for the relay's dual-auth routing/inbox methods. Kept out of
// `$lib/server` so the component can import them too. A real integrator would
// likely codegen these from the published lexicons; hand-typing keeps the demo
// dependency-light.

export type AlertRoute = 'push' | 'telegram' | 'push+telegram' | 'off';
/** App-wide route; 'default' inherits the user's account default. */
export type AppRoute = AlertRoute | 'default';
/** Per-category route; 'app' inherits the app-wide route. */
export type CategoryRoute = AlertRoute | 'app';

export interface RoutingView {
	route: AppRoute;
	defaultRoute: AlertRoute;
	categories: { id: string; description?: string; route: CategoryRoute }[];
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
