<script lang="ts">
	import type { AppRoute, Capability, CategoryRoute } from '@atmo/notifs-lexicons';
	import { goto, invalidateAll } from '$app/navigation';
	import AppMark from '$lib/components/AppMark.svelte';
	import ChannelRoutePicker from '$lib/components/ChannelRoutePicker.svelte';
	import IOSToggle from '$lib/components/IOSToggle.svelte';
	import {
		clearAppNotifications,
		revoke,
		setAppRouting,
		setManage,
		setMuted,
		setRouting
	} from '$lib/remote/notifs.remote';
	import { routeLabel } from '$lib/routes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let errorMsg = $state('');
	let notice = $state('');
	let confirmingRevoke = $state(false);
	let confirmingClear = $state(false);

	async function run(key: string, fn: () => Promise<unknown>) {
		busy[key] = true;
		errorMsg = '';
		try {
			await fn();
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not update routing';
		} finally {
			busy[key] = false;
		}
	}

	function changeApp(route: AppRoute) {
		const sender = data.app?.sender;
		if (sender) run('__app', () => setAppRouting({ sender, route }));
	}

	function changeCategory(category: string, route: CategoryRoute) {
		const sender = data.app?.sender;
		if (sender) run(category, () => setRouting({ sender, category, route }));
	}

	function changeManage(manage: Capability) {
		const sender = data.app?.sender;
		if (sender) run('__manage', () => setManage({ sender, manage }));
	}

	function changeMuted(muted: boolean) {
		const sender = data.app?.sender;
		if (sender) run('__mute', () => setMuted({ sender, muted }));
	}

	function revokeApp() {
		const sender = data.app?.sender;
		if (!sender) return;
		run('__revoke', async () => {
			await revoke({ sender });
			await goto('/apps');
		});
	}

	function clearNotifs() {
		const sender = data.app?.sender;
		if (!sender) return;
		notice = '';
		run('__clear', async () => {
			const { deleted } = await clearAppNotifications({ sender });
			confirmingClear = false;
			notice = `Cleared ${deleted} notification${deleted === 1 ? '' : 's'}.`;
		});
	}

	// Temporarily hidden: the per-app management-access control. The capability
	// still exists end-to-end (new grants default to 'self'); we just don't expose
	// the picker yet. Flip to `true` to bring the section back.
	const SHOW_MANAGEMENT_ACCESS = false;

	const CAPABILITIES: Capability[] = ['none', 'self', 'full'];
	const CAP_LABELS: Record<Capability, string> = {
		none: 'No access',
		self: 'Manage its own settings',
		full: 'Manage your whole account'
	};

	const selectClass =
		'shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg disabled:opacity-50';
</script>

<svelte:head><title>{data.app?.title ?? 'App'} · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<a href="/apps" class="mb-4 inline-block text-sm font-medium text-muted hover:text-fg">← Apps</a>

	{#if !data.app}
		<div class="rounded-card border border-dashed border-line px-6 py-10 text-center">
			<p class="text-sm font-medium text-fg">App not found</p>
			<p class="mt-1 text-sm text-muted">This app isn't connected.</p>
		</div>
	{:else}
		<header class="flex items-center gap-3 border-b border-line pb-4">
			{#if data.app.iconUrl}
				<img
					src={data.app.iconUrl}
					alt=""
					class="size-11 shrink-0 rounded-[0.7rem] bg-surface-2 object-cover {data.app.muted
						? 'opacity-60'
						: ''}"
				/>
			{:else}
				<AppMark id={data.app.title || data.app.sender} size={44} dim={data.app.muted} />
			{/if}
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-2xl font-bold tracking-tight text-fg">{data.app.title}</h1>
				<div class="truncate font-mono text-xs text-muted-2" title={data.app.sender}>
					{data.app.sender}
				</div>
			</div>
			<label class="flex shrink-0 items-center gap-2 text-xs text-muted-2">
				<span>Mute</span>
				<IOSToggle
					checked={data.app.muted}
					disabled={busy['__mute']}
					label="Mute {data.app.title}"
					onchange={changeMuted}
				/>
			</label>
		</header>

		{#if errorMsg}
			<p
				class="mt-4 rounded-card border border-line bg-danger/10 px-3 py-2 text-sm text-danger"
				role="alert"
			>
				{errorMsg}
			</p>
		{/if}

		<!-- App defaults -->
		<section class="mt-6 max-w-2xl">
			<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
				App defaults
			</h2>
			<div class="rounded-card border border-line bg-surface p-4">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<div class="text-sm font-medium text-fg">Where this app's notifications go</div>
						<p class="mt-1 text-xs text-muted">
							<span class="font-medium text-fg">Account default</span> follows your
							<a href="/settings?tab=routing" class="text-accent hover:underline">default route</a>
							({routeLabel(data.defaultRoute)}). <span class="font-medium text-fg">Inbox only</span>
							saves them with no alerts; <span class="font-medium text-fg">Off</span> drops them entirely.
						</p>
					</div>
					<ChannelRoutePicker
						value={data.app.route}
						inherit={{ token: 'default', label: 'Account default' }}
						instances={data.channels}
						disabled={busy['__app']}
						onchange={changeApp}
					/>
				</div>
			</div>
		</section>

		<!-- Per-category routing -->
		<section class="mt-8 max-w-2xl">
			<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Categories</h2>
			{#if data.app.categories.length === 0}
				<div class="rounded-card border border-dashed border-line px-6 py-8 text-center">
					<p class="text-sm font-medium text-fg">No categories yet</p>
					<p class="mx-auto mt-1 max-w-sm text-sm text-muted">
						Categories appear here once this app sends them. Until then, everything uses the app
						routing above.
					</p>
				</div>
			{:else}
				<ul class="overflow-hidden rounded-card border border-line bg-surface">
					{#each data.app.categories as c, i (c.category)}
						<li
							class="flex items-start justify-between gap-3 p-4 {i < data.app.categories.length - 1
								? 'border-b border-line-2'
								: ''}"
						>
							<div class="min-w-0">
								<div class="text-sm font-semibold text-fg">{c.title ?? c.category}</div>
								{#if c.title}
									<div class="truncate font-mono text-[0.65rem] text-muted-2">{c.category}</div>
								{/if}
								{#if c.description}<div class="text-xs text-muted">{c.description}</div>{/if}
							</div>
							<ChannelRoutePicker
								value={c.route}
								inherit={{ token: 'app', label: 'App default' }}
								instances={data.channels}
								disabled={busy[c.category]}
								onchange={(route) => changeCategory(c.category, route)}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Management access (capability designation; see MANAGEMENT-AUTH.md).
		     Temporarily hidden via SHOW_MANAGEMENT_ACCESS; backend still works. -->
		{#if SHOW_MANAGEMENT_ACCESS}
			<section class="mt-8 max-w-2xl">
				<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
					Management access
				</h2>
				<div class="rounded-card border border-line bg-surface p-4">
					<div class="flex items-center justify-between gap-4">
						<div class="min-w-0">
							<div class="text-sm font-medium text-fg">Let this app change your settings</div>
							<p class="mt-1 text-xs text-muted">
								<span class="font-medium text-fg">Manage its own settings</span> lets the app adjust
								how
								<em>its</em> notifications reach you, from inside the app.
								<span class="font-medium text-fg">Manage your whole account</span> lets it act as a full
								dashboard — every app, channel and setting. Grant full access only to apps you trust.
							</p>
						</div>
						<select
							class={selectClass}
							value={data.app.manage}
							disabled={busy['__manage']}
							onchange={(e) => changeManage(e.currentTarget.value as Capability)}
						>
							{#each CAPABILITIES as c (c)}
								<option value={c}>{CAP_LABELS[c]}</option>
							{/each}
						</select>
					</div>
				</div>
			</section>
		{/if}

		<!-- Notifications -->
		<section class="mt-8 max-w-2xl">
			<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
				Notifications
			</h2>
			<div
				class="flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-4"
			>
				<div class="min-w-0">
					<div class="text-sm font-medium text-fg">Clear notifications from this app</div>
					<p class="mt-1 text-xs text-muted">
						{#if notice}
							<span class="text-accent">{notice}</span>
						{:else}
							Permanently deletes every notification this app sent you from your inbox. This can't
							be undone.
						{/if}
					</p>
				</div>
				{#if confirmingClear}
					<div class="flex shrink-0 gap-2">
						<button
							class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2"
							onclick={() => (confirmingClear = false)}
						>
							Cancel
						</button>
						<button
							class="rounded-md border border-danger px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
							disabled={busy['__clear']}
							onclick={clearNotifs}
						>
							Clear all
						</button>
					</div>
				{:else}
					<button
						class="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
						onclick={() => {
							notice = '';
							confirmingClear = true;
						}}
					>
						Clear all
					</button>
				{/if}
			</div>
		</section>

		<!-- Revoke -->
		<section class="mt-8 max-w-2xl">
			<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Remove</h2>
			<div
				class="flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-4"
			>
				<div class="min-w-0">
					<div class="text-sm font-medium text-fg">Revoke this app</div>
					<p class="mt-1 text-xs text-muted">
						It can no longer notify you. Anything it already sent stays in your inbox.
					</p>
				</div>
				{#if confirmingRevoke}
					<div class="flex shrink-0 gap-2">
						<button
							class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2"
							onclick={() => (confirmingRevoke = false)}
						>
							Cancel
						</button>
						<button
							class="rounded-md border border-danger px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
							disabled={busy['__revoke']}
							onclick={revokeApp}
						>
							Confirm revoke
						</button>
					</div>
				{:else}
					<button
						class="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
						onclick={() => (confirmingRevoke = true)}
					>
						Revoke
					</button>
				{/if}
			</div>
		</section>
	{/if}
</div>
