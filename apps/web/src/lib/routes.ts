// Route options for the routing UI. Alert routes gate push/telegram; everything
// is in the inbox regardless. `default` (per-category) inherits the user default.
import type { AlertRoute, CategoryRoute } from '@atmo/notifs-lexicons';

export const ALERT_ROUTES = [
	'push',
	'telegram',
	'push+telegram',
	'off'
] as const satisfies readonly AlertRoute[];

export const CATEGORY_ROUTES = [
	'default',
	'push',
	'telegram',
	'push+telegram',
	'off'
] as const satisfies readonly CategoryRoute[];

export const ROUTE_LABELS: Record<CategoryRoute, string> = {
	default: 'Default',
	push: 'Push',
	telegram: 'Telegram',
	'push+telegram': 'Push + Telegram',
	off: 'Off'
};
