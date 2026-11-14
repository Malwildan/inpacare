<script lang="ts">
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { LayoutDashboard, BedDouble, CalendarDays, ClipboardList, FileHeart, ReceiptText, LogOut, Bell, Menu, X } from 'lucide-svelte';
import type { User, Auth } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
import type { Notifications, Notification } from '$lib/features/notifications';
import { sessionFailure } from '$lib/shared/presentation/session';
import { Button } from '$lib/shared/ui/button/index.js';
import { Alert, AlertDescription } from '$lib/shared/ui/alert/index.js';
import * as Breadcrumb from '$lib/shared/ui/breadcrumb/index.js';
import * as Popover from '$lib/shared/ui/popover/index.js';
import * as Sheet from '$lib/shared/ui/sheet/index.js';
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
let notificationsLoading = $state(false);
let notificationButton = $state<HTMLButtonElement | null>(null);
let menuButton = $state<HTMLButtonElement | null>(null);
let navigationBrand = $state<HTMLAnchorElement | null>(null);
let loggingOut = $state(false);
const navigation = [
    { path: '/dashboard', label: 'Dashboard Siklus', icon: LayoutDashboard, roles: ['DOKTER', 'PERAWAT'] },
    { path: '/rooms', label: 'Manajemen Ruangan', icon: BedDouble, roles: ['PERAWAT', 'ADMISI'] },
    { path: '/calendar', label: 'Kalender Ruangan', icon: CalendarDays, roles: ['PERAWAT', 'DOKTER', 'ADMISI'] },
    { path: '/medical-records', label: 'Rekam Medis', icon: FileHeart, roles: ['DOKTER', 'PERAWAT', 'ADMISI'] },
    { path: '/tasks', label: 'Tugas Perawatan', icon: ClipboardList, roles: ['PERAWAT'] },
    { path: '/invoices', label: 'Tagihan', icon: ReceiptText, roles: ['ADMISI'] }
];
let current = $derived(navigation.find((item) => page.url.pathname.startsWith(item.path))?.label ?? 'Ringkasan Pasien');
let role = $derived(data.user.coordinator ? 'Koordinator Perawat' : ({ DOKTER: 'Dokter', PERAWAT: 'Perawat', ADMISI: 'Admisi' }[data.user.role]));
async function logout() {
    if (loggingOut) return;
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
    if (notificationsLoading)
        return;
    notificationsLoading = true;
    notificationError = '';
    try {
        notifications = await notificationService.list();
        notificationError = '';
    }
    catch (error) {
        notificationError = sessionFailure(error);
    }
    finally {
        notificationsLoading = false;
    }
}
function closeNavigation() {
    mobileOpen = false;
    menuButton?.focus();
}
function closeNotifications() {
    notificationsOpen = false;
    notificationButton?.focus();
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
const home = $derived(data.user.role === 'ADMISI' ? '/invoices' : '/dashboard');
</script>
<svelte:head>
    <title>{current} · InpaCare</title>
    <meta name="description" content="InpaCare — sistem rawat inap terhubung." />
</svelte:head>

{#snippet navigationContent()}
    <nav aria-label="Navigasi utama" class="flex-1 overflow-y-auto px-3 py-4">
        <ul class="flex flex-col gap-1">
            {#each navigation.filter(item => item.roles.includes(data.user.role)) as item}
                {@const active = page.url.pathname.startsWith(item.path)}
                <li>
                    <Button href={item.path} variant={active ? 'secondary' : 'ghost'} aria-current={active ? 'page' : undefined}
                        class={'h-11 w-full justify-start gap-3 px-3 font-medium no-underline hover:no-underline motion-reduce:transition-none ' + (active ? 'text-primary' : 'text-sidebar-foreground')} onclick={() => mobileOpen = false}>
                        <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />{item.label}
                    </Button>
                </li>
            {/each}
        </ul>
    </nav>
    <footer class="space-y-3 border-t p-4">
        <div class="min-w-0 space-y-1">
            <p class="text-sm font-semibold text-foreground">{role}</p>
            <p class="break-words text-sm text-muted-foreground">{data.user.name}</p>
        </div>
        <Button variant="outline" class="h-11 w-full justify-start gap-3 motion-reduce:transition-none" onclick={logout} disabled={loggingOut}>
            <LogOut size={17} aria-hidden="true" />{loggingOut ? 'Keluar…' : 'Keluar'}
        </Button>
    </footer>
{/snippet}

<a href="#main-content" class="fixed -top-20 left-4 z-[100] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:top-4">Lewati navigasi</a>
<aside aria-label="Navigasi samping" class="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
    <a href={home} class="flex h-16 items-center gap-3 border-b px-6 font-bold text-primary">
        <span class="text-xl tracking-tight">InpaCare</span><span class="text-xs font-medium text-muted-foreground">RSI</span>
    </a>
    {@render navigationContent()}
</aside>

<div class="min-h-screen min-w-0 lg:pl-64">
    <header class="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6 lg:px-8">
        <div class="flex min-w-0 items-center gap-2">
            <Sheet.Root bind:open={mobileOpen}>
                <Sheet.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} bind:ref={menuButton} variant="ghost" size="icon" class="size-11 shrink-0 motion-reduce:transition-none lg:hidden"
                            aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'}>
                            <Menu size={20} aria-hidden="true" />
                        </Button>
                    {/snippet}
                </Sheet.Trigger>
                <Sheet.Content side="left" id="main-navigation" showCloseButton={false} class="gap-0 motion-reduce:animate-none motion-reduce:transition-none"
                    onOpenAutoFocus={(event) => { event.preventDefault(); navigationBrand?.focus(); }}
                    onCloseAutoFocus={(event) => { event.preventDefault(); menuButton?.focus(); }}>
                    <Sheet.Title class="sr-only">Navigasi aplikasi</Sheet.Title>
                    <Sheet.Description class="sr-only">Halaman yang tersedia untuk {role}.</Sheet.Description>
                    <div class="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4">
                        <a bind:this={navigationBrand} class="brand text-xl font-bold tracking-tight text-primary" href={home} onclick={() => mobileOpen = false}>InpaCare <span class="text-xs font-medium text-muted-foreground">RSI</span></a>
                        <Button variant="ghost" size="icon" class="size-11 motion-reduce:transition-none" aria-label="Tutup navigasi" onclick={closeNavigation}><X size={20} aria-hidden="true" /></Button>
                    </div>
                    {@render navigationContent()}
                </Sheet.Content>
            </Sheet.Root>
            <Breadcrumb.Root aria-label="Lokasi halaman" class="min-w-0">
                <Breadcrumb.List class="flex-nowrap">
                    <Breadcrumb.Item class="hidden sm:inline-flex"><Breadcrumb.Link href={home}>InpaCare</Breadcrumb.Link></Breadcrumb.Item>
                    <Breadcrumb.Separator class="hidden sm:block" />
                    <Breadcrumb.Item class="min-w-0"><Breadcrumb.Page class="truncate font-medium">{current}</Breadcrumb.Page></Breadcrumb.Item>
                </Breadcrumb.List>
            </Breadcrumb.Root>
        </div>
        <div class="flex shrink-0 items-center gap-2 sm:gap-4">
            <time class="hidden text-xs text-muted-foreground xl:block">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())}</time>
            <Popover.Root bind:open={notificationsOpen} onOpenChange={(open) => { if (open) void showNotifications(); }}>
                <Popover.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} bind:ref={notificationButton} variant="ghost" size="icon" class="size-11 motion-reduce:transition-none" aria-label="Notifikasi"><Bell size={19} aria-hidden="true" /></Button>
                    {/snippet}
                </Popover.Trigger>
                <Popover.Content align="end" aria-label="Notifikasi" class="max-h-[min(32rem,80dvh)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-0 motion-reduce:animate-none">
                    <div class="flex items-center justify-between gap-3 border-b px-4 py-2">
                        <h2 class="text-base font-semibold">Notifikasi</h2>
                        <Button variant="ghost" size="icon" class="size-11" aria-label="Tutup notifikasi" onclick={closeNotifications}><X size={18} aria-hidden="true" /></Button>
                    </div>
                    <div class="space-y-2 p-3">
                        {#if notificationsLoading}
                            <p role="status" class="p-3 text-sm text-muted-foreground">Memuat notifikasi…</p>
                        {:else if notificationError}
                            <Alert variant="destructive"><AlertDescription>{notificationError}</AlertDescription></Alert>
                            <Button variant="outline" class="h-11 w-full" onclick={showNotifications}>Coba lagi</Button>
                        {:else if notifications.length === 0}
                            <p class="p-3 text-sm text-muted-foreground">Belum ada notifikasi.</p>
                        {:else}
                            {#each notifications as notice (notice.id)}
                                <Button variant={notice.readAt ? 'ghost' : 'secondary'} class="h-auto min-h-11 w-full flex-col items-start gap-1 whitespace-normal p-3 text-left font-normal" onclick={() => readNotification(notice.id)}>
                                    <span>{notice.message}</span>
                                    <small class="text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</small>
                                    <span class="sr-only">{notice.readAt ? 'Sudah dibaca' : 'Belum dibaca'}</span>
                                </Button>
                            {/each}
                        {/if}
                    </div>
                </Popover.Content>
            </Popover.Root>
            <span title={data.user.name} class="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{data.user.name.replace(/^dr\. /, '').split(' ').map(name => name[0]).slice(0, 2).join('')}</span>
        </div>
    </header>
    <main id="main-content" tabindex="-1" class="mx-auto min-w-0 max-w-[1600px] p-4 sm:p-6 lg:p-8">{@render children()}</main>
</div>
