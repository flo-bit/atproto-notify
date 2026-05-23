// Route options for the routing UI. Concrete alert routes gate push/telegram;
// everything is in the inbox regardless. Inheritance: a category can be 'app'
// (use the app-wide route); an app can be 'default' (use the account default).
import type { AlertRoute, AppRoute, CategoryRoute } from '@atmo/notifs-lexicons';

export const ALERT_ROUTES = [
	'push',
	'telegram',
	'push+telegram',
	'off'
] as const satisfies readonly AlertRoute[];

/** App-wide selector: inherit account default, or a concrete route. */
export const APP_ROUTES = [
	'default',
	'push',
	'telegram',
	'push+telegram',
	'off'
] as const satisfies readonly AppRoute[];

/** Per-category selector: inherit the app-wide route, or a concrete route. */
export const CATEGORY_ROUTES = [
	'app',
	'push',
	'telegram',
	'push+telegram',
	'off'
] as const satisfies readonly CategoryRoute[];

export const ROUTE_LABELS: Record<string, string> = {
	default: 'Account default',
	app: 'Like app',
	push: 'Push',
	telegram: 'Telegram',
	'push+telegram': 'Push + Telegram',
	off: 'Off'
};
