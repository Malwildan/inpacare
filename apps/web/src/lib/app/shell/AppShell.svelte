<script lang="ts">
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { LayoutDashboard, BedDouble, CalendarDays, ClipboardList, FileHeart, ReceiptText, CodeXml, LogOut, Bell, Menu, X, ChevronRight } from 'lucide-svelte';
import type { User, Auth } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
import type { Notifications, Notification } from '$lib/features/notifications';
import { sessionFailure } from '$lib/shared/presentation/session';
let { data, children, auth, notificationService }: {
    data: {
        user: User;
        reference: Reference;
    };
    children: import('svelte').Snippet;
    auth: Auth;
    notificationService: Notifications;
} = $props();
let mobileOpen = $state(false);
let notificationsOpen = $state(false);
let notifications = $state<Notification[]>([]);
let notificationError = $state('');
let loggingOut = $state(false);
const navigation = [
    { path: '/dashboard', label: 'Dashboard Siklus', icon: LayoutDashboard, roles: ['DOKTER', 'PERAWAT'] },
    { path: '/rooms', label: 'Manajemen Ruangan', icon: BedDouble, roles: ['PERAWAT', 'ADMISI'] },
    { path: '/calendar', label: 'Kalender Ruangan', icon: CalendarDays, roles: ['PERAWAT', 'DOKTER', 'ADMISI'] },
    { path: '/medical-records', label: 'Rekam Medis', icon: FileHeart, roles: ['DOKTER', 'PERAWAT', 'ADMISI'] },
    { path: '/tasks', label: 'Tugas Perawatan', icon: ClipboardList, roles: ['PERAWAT'] },
    { path: '/invoices', label: 'Tagihan', icon: ReceiptText, roles: ['ADMISI'] },
    { path: '/api-docs', label: 'API Explorer', icon: CodeXml, roles: ['DOKTER', 'PERAWAT', 'ADMISI'] }
];
let current = $derived(navigation.find((item) => page.url.pathname.startsWith(item.path))?.label ?? 'Ringkasan Pasien');
let role = $derived(data.user.coordinator ? 'Koordinator Perawat' : ({ DOKTER: 'Dokter', PERAWAT: 'Perawat', ADMISI: 'Admisi' }[data.user.role]));
async function logout() {
    loggingOut = true;
    try {
        await auth.logout();
        await goto('/login', { invalidateAll: true });
    }
    catch (failure) {
        sessionFailure(failure);
        loggingOut = false;
    }
}
async function showNotifications() {
    notificationsOpen = !notificationsOpen;
    if (!notificationsOpen)
        return;
    try {
        notifications = await notificationService.list();
        notificationError = '';
    }
    catch (error) {
        notificationError = sessionFailure(error);
    }
}
async function readNotification(id: string) {
    try {
        await notificationService.markRead(id);
        notifications = notifications.map((notice) => notice.id === id ? { ...notice, readAt: new Date().toISOString() } : notice);
    }
    catch (error) {
        notificationError = sessionFailure(error);
    }
}
</script>

<svelte:head>
	<title>{current} · InpaCare</title>
	<meta name="description" content="InpaCare — sistem rawat inap terhubung." />
</svelte:head>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') { mobileOpen = false; notificationsOpen = false; } }}/>

<a class="skip-link" href="#main-content">Lewati navigasi</a>
{#if mobileOpen}
	<button class="sidebar-backdrop" aria-label="Tutup navigasi" onclick={() => (mobileOpen = false)}></button>
{/if}

<aside id="main-navigation" class:open={mobileOpen} class="sidebar" aria-label="Navigasi samping">
	<a class="brand" href={data.user.role === 'ADMISI' ? '/invoices' : '/dashboard'}>
		<span class="brand-name">InpaCare</span>
		<span class="brand-org">RSI</span>
	</a>

	<nav aria-label="Navigasi utama">
		{#each navigation.filter((item) => item.roles.includes(data.user.role)) as item}
			{@const active = page.url.pathname.startsWith(item.path)}
			<a
				class:active
				aria-current={active ? 'page' : undefined}
				href={item.path}
				onclick={() => (mobileOpen = false)}
			>
				<item.icon size={18} strokeWidth={1.7} />
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>

	<div class="sidebar-bottom">
		<button class="logout" onclick={logout} disabled={loggingOut}>
			<LogOut size={17} />
			{loggingOut ? 'Keluar…' : 'Keluar'}
		</button>
		<div class="user-summary">
			<strong>{role}</strong>
			<span>{data.user.name}</span>
		</div>
	</div>
</aside>

<div class="app-body">
	<header class="topbar">
		<div class="breadcrumbs">
			<button
				class="icon-button menu-toggle"
				aria-label="Buka navigasi"
				aria-expanded={mobileOpen}
				aria-controls="main-navigation"
				onclick={() => (mobileOpen = !mobileOpen)}
			>
				{#if mobileOpen}<X size={20} />{:else}<Menu size={20} />{/if}
			</button>

			<span class="current-page">{current}</span>
		</div>
		<div class="topbar-actions">
			<time>{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())}</time>
			<button
				class="icon-button"
				aria-label="Notifikasi"
				aria-expanded={notificationsOpen}
				aria-controls="notifications-panel"
				onclick={showNotifications}
			>
				<Bell size={19} />
			</button>
			<div class="avatar" title={data.user.name}>
				{data.user.name.replace(/^dr\. /, '').split(' ').map((name) => name[0]).slice(0, 2).join('')}
			</div>
		</div>
	</header>

	{#if notificationsOpen}
		<section id="notifications-panel" class="notifications" aria-label="Notifikasi">
			<div class="panel-header">
				<h2>Notifikasi</h2>
				<button class="icon-button" aria-label="Tutup notifikasi" onclick={() => (notificationsOpen = false)}>
					<X size={18} />
				</button>
			</div>
			{#if notificationError}
				<p class="error" role="alert">{notificationError}</p>
			{:else if notifications.length === 0}
				<p class="empty">Belum ada notifikasi.</p>
			{:else}
				{#each notifications as notice}
					<button class:unread={!notice.readAt} class="notification" onclick={() => readNotification(notice.id)}>
						<span>{notice.message}</span>
						<small>{new Date(notice.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</small>
					</button>
				{/each}
			{/if}
		</section>
	{/if}

	<main id="main-content">{@render children()}</main>
</div>

<style>
	.skip-link {
		position: fixed;
		top: -60px;
		left: 16px;
		z-index: 100;
		padding: 10px 14px;
		border-radius: 8px;
		background: var(--surface);
		color: var(--primary);
	}

	.skip-link:focus {
		top: 8px;
	}

	.sidebar {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		width: 236px;
		padding: 24px 18px 18px;
		border-right: 1px solid var(--border);
		background: #f1f3f7;
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 9px;
		margin: 0 8px 30px;
		color: var(--text);
	}

	.brand:hover {
		text-decoration: none;
	}

	.brand-name {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.03em;
	}

	.brand-org {
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	nav a {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 9px 11px;
		border-radius: 8px;
		color: #4d586a;
		font-size: 14px;
		font-weight: 550;
		white-space: nowrap;
	}

	nav a:hover {
		background: #e9ecf3;
		color: var(--text);
		text-decoration: none;
	}

	nav a.active {
		background: var(--primary-soft);
		color: #33458f;
		font-weight: 650;
	}

	.sidebar-bottom {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: auto;
	}

	.logout {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 8px 11px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #4d586a;
		font-size: 14px;
		text-align: left;
	}

	.logout:hover:not(:disabled) {
		background: #e9ecf3;
		color: var(--text);
	}

	.user-summary {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 10px 4px;
		border-top: 1px solid var(--border);
	}

	.user-summary strong {
		font-size: 14px;
	}

	.user-summary span {
		color: var(--muted);
		font-size: 13px;
	}

	.user-summary .demo-tag {
		margin-top: 4px;
		color: #4c5d9f;
		font-size: 12px;
	}

	.app-body {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		margin-left: 236px;
	}

	.topbar {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: space-between;
		min-height: 64px;
		padding: 0 30px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		gap: 16px;
	}

	.breadcrumbs,
	.topbar-actions {
		display: flex;
		align-items: center;
	}

	.breadcrumbs {
		gap: 9px;
		min-width: 0;
		color: var(--muted);
		font-size: 14px;
	}

	.breadcrumbs .current-page {
		color: var(--text);
		font-weight: 550;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.topbar-actions {
		gap: 12px;
		flex-shrink: 0;
	}

	.topbar time {
		color: var(--muted);
		font-size: 13px;
	}

	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--primary-soft);
		color: #35478f;
		font-size: 13px;
		font-weight: 650;
	}

	main {
		flex: 1;
		width: 100%;
		max-width: 1660px;
		min-width: 0;
		margin: 0 auto;
		padding: 32px 30px 24px;
	}

	.app-footer {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 30px 18px;
		color: var(--muted);
		font-size: 12px;
	}

	.menu-toggle {
		display: none;
	}

	.notifications {
		position: fixed;
		top: 58px;
		right: 24px;
		z-index: 60;
		width: 380px;
		max-width: calc(100vw - 24px);
		max-height: 75vh;
		overflow: auto;
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	.notification {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		padding: 13px 10px;
		border: 0;
		border-bottom: 1px solid #e8ebf0;
		background: var(--surface);
		color: var(--text);
		font-size: 14px;
		text-align: left;
	}

	.notification:hover:not(:disabled) {
		background: #f6f7fa;
	}

	.notification.unread {
		background: var(--primary-soft);
	}

	.notification small {
		color: var(--muted);
	}

	.sidebar-backdrop {
		position: fixed;
		inset: 0;
		z-index: 39;
		border: 0;
		background: #17203366;
	}

	@media (max-width: 1050px) {
		.topbar time {
			display: none;
		}
		main {
			padding: 28px 22px 22px;
		}

		.topbar {
			padding: 0 22px;
		}

		.topbar-actions {
			gap: 8px;
		}
	}

	@media (max-width: 760px) {
		.sidebar {
			transform: translateX(-100%);
			visibility: hidden;
			transition: transform 160ms ease-out;
		}

		.sidebar.open {
			transform: translateX(0);
			visibility: visible;
		}

		.app-body {
			margin-left: 0;
		}

		.menu-toggle {
			display: inline-flex;
		}

		.topbar {
			min-height: 60px;
			padding: 0 14px;
		}

		.topbar time {
			display: none;
		}

		.breadcrumbs > span:first-of-type,
		.breadcrumbs > :global(svg) {
			display: none;
		}

		main {
			padding: 24px 16px;
		}

		.app-footer {
			padding: 10px 16px 18px;
			font-size: 12px;
		}

		.topbar-actions {
			gap: 4px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sidebar {
			transition: none;
		}
	}
</style>
