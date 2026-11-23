<script lang="ts">
import { onMount } from 'svelte';
import { Check, RefreshCw, X } from 'lucide-svelte';
import type { Notifications } from '../application/notifications';
import type { Notification } from '../domain/models';
import { Button } from '$lib/shared/ui/button/index.js';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
import { toast } from '$lib/shared/ui/sonner/index.js';
import { sessionFailure } from '$lib/shared/presentation/session';

let { service, onclose }: { service: Notifications; onclose: () => void } = $props();
let notices = $state<Notification[]>([]);
let loading = $state(true);
let failure = $state('');
let reading = $state<string | null>(null);
let active = true;
onMount(() => { void load(); return () => { active = false; }; });
async function load() {
    loading = true;
    failure = '';
    try {
        const result = await service.list();
        if (active) notices = result;
    } catch (cause) {
        if (active) failure = sessionFailure(cause, 'load', 'Notifikasi');
    } finally { if (active) loading = false; }
}
async function markRead(id: string) {
    if (reading) return;
    reading = id;
    try {
        await service.markRead(id);
        notices = notices.map(notice => notice.id === id ? { ...notice, readAt: new Date().toISOString() } : notice);
        toast.success('Notifikasi ditandai sebagai sudah dibaca.');
    } catch (cause) { toast.error(sessionFailure(cause, 'save', 'status baca notifikasi')); }
    finally { reading = null; }
}
</script>

<Modal title="Semua notifikasi" description="Lihat pemberitahuan dan tandai sebagai sudah dibaca." busy={reading !== null} {onclose}>
    {#snippet children(close)}
    {#if loading}
        <p role="status">Memuat notifikasi…</p>
    {:else if failure}
        <p role="alert" class="text-sm text-destructive">{failure}</p>
        <Button variant="outline" class="h-11" onclick={load}><RefreshCw aria-hidden="true" /> Coba lagi</Button>
    {:else if notices.length === 0}
        <p class="muted">Belum ada notifikasi.</p>
    {:else}
        <p class="mb-4 text-sm text-muted-foreground">{notices.filter(notice => !notice.readAt).length} belum dibaca · {notices.length} notifikasi</p>
        <ul class="divide-y">
            {#each notices as notice (notice.id)}
                <li class="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0 space-y-1 break-words">
                        <p>{notice.message}</p>
                        <time class="text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</time>
                        {#if notice.readAt}<p class="text-sm text-muted-foreground">Sudah dibaca</p>{/if}
                    </div>
                    {#if !notice.readAt}<Button variant="outline" class="min-h-11 shrink-0" disabled={reading !== null} onclick={() => markRead(notice.id)}><Check aria-hidden="true" /> {reading === notice.id ? 'Menyimpan…' : 'Tandai dibaca'}</Button>{/if}
                </li>
            {/each}
        </ul>
    {/if}
    <div class="form-actions"><Button variant="outline" class="h-11" disabled={reading !== null} onclick={close}><X aria-hidden="true" /> Tutup notifikasi</Button></div>
    {/snippet}
</Modal>
