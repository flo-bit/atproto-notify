// Tiny app-wide toast store (sonner-style corner notifications). Mutate the
// shared `toasts` array in place so it stays reactive across modules; render it
// once via <Toaster /> in the (app) layout.
export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	type: ToastType;
	message: string;
}

let nextId = 0;
export const toasts = $state<Toast[]>([]);

export function dismiss(id: number): void {
	const i = toasts.findIndex((t) => t.id === id);
	if (i !== -1) toasts.splice(i, 1);
}

function push(type: ToastType, message: string, ms: number): void {
	const id = nextId++;
	toasts.push({ id, type, message });
	if (ms > 0) setTimeout(() => dismiss(id), ms);
}

export const toast = {
	success: (message: string, ms = 4000) => push('success', message, ms),
	error: (message: string, ms = 6000) => push('error', message, ms),
	info: (message: string, ms = 4000) => push('info', message, ms)
};
