<script lang="ts">
import { Button } from '$lib/shared/ui/button/index.js';
import StatusBadge from '$lib/shared/ui/status-badge.svelte';
import { sessionFailure } from '$lib/shared/presentation/session';
import type { TaskPage, Tasks } from '$lib/features/tasks';

let { cycleId, tasks }: { cycleId: string; tasks: Tasks } = $props();
const limit = 10;
let offset = $state(0);
let result = $state<TaskPage>();
let loading = $state(true);
let failure = $state('');
let revision = $state(0);
const schedule = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
});

$effect(() => {
    let current = true;
    const query = { cycleId, limit, offset };
    revision;
    loading = true;
    failure = '';
    tasks.list(query).then(
        page => { if (current) result = page; },
        cause => { if (current) failure = sessionFailure(cause, 'load', 'Daftar tugas rekap'); },
    ).finally(() => { if (current) loading = false; });
    return () => { current = false; };
});
</script>

{#if failure}
    <p class="text-sm text-destructive" role="alert">{failure}</p>
    <Button variant="outline" type="button" onclick={() => revision++}>Muat ulang tugas</Button>
{:else if loading}
    <p class="text-sm text-muted-foreground" role="status">Memuat tugas rekap…</p>
{:else if result?.items.length}
    <ul class="divide-y">
        {#each result.items as task (task.id)}
            <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                    <a class="font-medium underline underline-offset-4" href={`/tasks?${new URLSearchParams({ task: task.id, cycle: cycleId })}`}>{task.title}</a>
                    <p class="text-sm text-muted-foreground">{task.picName} · <time datetime={task.startsAt}>{schedule.format(new Date(task.startsAt))} WIB</time></p>
                </div>
                <StatusBadge value={task.status} />
            </li>
        {/each}
    </ul>
{:else}
    <p class="text-sm text-muted-foreground">Belum ada tugas yang dibuat dari rekap ini.</p>
{/if}
{#if result && (offset > 0 || result.total > limit)}
    <nav class="mt-2 flex gap-2" aria-label="Halaman tugas rekap">
        <Button variant="outline" type="button" disabled={loading || offset === 0} onclick={() => offset -= limit}>Sebelumnya</Button>
        <Button variant="outline" type="button" disabled={loading || offset + limit >= result.total} onclick={() => offset += limit}>Berikutnya</Button>
    </nav>
{/if}
