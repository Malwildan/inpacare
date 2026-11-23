<script lang="ts">
import { tick, untrack } from 'svelte';
import { RefreshCw, Save, X } from 'lucide-svelte';
import { Button } from '$lib/shared/ui/button/index.js';
import FormDatePicker from '$lib/shared/ui/form-date-picker.svelte';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Input } from '$lib/shared/ui/input/index.js';
import { Textarea } from '$lib/shared/ui/textarea/index.js';
import { date } from '$lib/shared/format';
import { ApiError } from '$lib/shared/errors';
import { formText } from '$lib/shared/presentation/form';
import { sessionFailure } from '$lib/shared/presentation/session';
import type { NewTask, Tasks } from '$lib/features/tasks';
import type { Cycle, CycleAssignee } from '../domain/models';

let { cycle, candidates, tasks, busy = $bindable(false), onCreated, onRefresh, onCancel }: {
    cycle: Cycle;
    candidates: CycleAssignee[];
    tasks: Tasks;
    busy?: boolean;
    onCreated: () => void;
    onRefresh: () => Promise<void>;
    onCancel: () => void;
} = $props();

const id = $props.id();
let placement = $derived(cycle.taskPlacement);
let picId = $state(untrack(() => candidates.some(candidate => candidate.id === cycle.nurseId) ? cycle.nurseId : ''));
let needsRefresh = $state(false);
let failure = $state('');
let update = $state('');
let errorSummary = $state<HTMLElement>();

async function showError(message: string) {
    failure = message;
    await tick();
    errorSummary?.focus();
}

async function refresh() {
    if (busy) return;
    busy = true;
    failure = '';
    try {
        await onRefresh();
        if (!candidates.some(candidate => candidate.id === picId)) picId = '';
        needsRefresh = false;
        update = 'Konteks terbaru sudah dimuat. Periksa penempatan dan jadwal sebelum menyimpan.';
    } catch (cause) {
        await showError(sessionFailure(cause, 'load', 'Konteks tugas'));
    } finally {
        busy = false;
    }
}

async function createTask(event: SubmitEvent) {
    event.preventDefault();
    if (busy || needsRefresh || !placement) return;
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    busy = true;
    failure = '';
    update = '';
    try {
        await tasks.create({
            cycleContext: { cycleId: cycle.id, placementVersion: placement.version },
            type: formText(fields, 'type') === 'measurement' ? 'measurement' : 'regular',
            patientId: cycle.patientId,
            placementId: placement.id,
            picId: formText(fields, 'picId'),
            title: formText(fields, 'title'),
            description: formText(fields, 'description'),
            notes: formText(fields, 'notes'),
            priority: formText(fields, 'priority') as NewTask['priority'],
            startsAt: `${formText(fields, 'startsAt')}:00+07:00`,
            endsAt: `${formText(fields, 'endsAt')}:00+07:00`,
        });
        onCreated();
    } catch (cause) {
        needsRefresh = cause instanceof ApiError && (cause.status === 409 || cause.status === 404);
        await showError(needsRefresh
            ? 'Penempatan atau rekap sudah berubah. Muat konteks terbaru untuk memeriksa sebelum menyimpan kembali.'
            : sessionFailure(cause, 'save', 'tugas perawatan'));
    } finally {
        busy = false;
    }
}
</script>

<dl class="mb-5 space-y-3 text-sm">
    <div>
        <dt class="text-muted-foreground">Pasien</dt>
        <dd class="font-medium">{cycle.patientName} · {cycle.medicalRecordNo}</dd>
    </div>
    <div>
        <dt class="text-muted-foreground">Penempatan pasien</dt>
        {#if placement}
            <dd class="font-medium">{placement.roomName} · {date(placement.startsOn)}–{date(placement.endsOn)}</dd>
        {:else}
            <dd>Kaitkan penempatan aktif ke rekap sebelum menyimpan tugas.</dd>
        {/if}
    </div>
</dl>

{#if failure}<p bind:this={errorSummary} class="mb-3 text-sm text-destructive" role="alert" tabindex="-1">{failure}</p>{/if}
{#if update}<p class="mb-3 text-sm" role="status">{update}</p>{/if}
{#if needsRefresh || !placement}
    <Button variant="outline" type="button" class="mb-4 h-11" disabled={busy} onclick={refresh}>
        <RefreshCw aria-hidden="true" /> Muat konteks terbaru
    </Button>
{/if}
<form method="post" aria-label="Buat tugas perawatan" class="grid gap-4" onsubmit={createTask}>
    <div class="grid gap-1.5">
        <label for={id + '-title'}>Judul tugas (wajib)</label>
        <Input id={id + '-title'} name="title" class="h-11 text-base" required maxlength={150} />
    </div>
    <fieldset class="grid gap-1">
        <legend class="mb-1">Jenis tugas</legend>
        <div class="flex flex-wrap gap-x-4">
            <label class="flex min-h-11 items-center gap-2">
                <input type="radio" name="type" value="regular" checked /> Perawatan umum
            </label>
            <label class="flex min-h-11 items-center gap-2">
                <input type="radio" name="type" value="measurement" /> Pengukuran
            </label>
        </div>
    </fieldset>
    <div class="grid gap-1.5">
        <label for={id + '-pic'}>Perawat penanggung jawab (wajib)</label>
        <select id={id + '-pic'} name="picId" required bind:value={picId} aria-describedby={id + '-pic-help'}
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Pilih perawat aktif</option>
            {#each candidates as candidate (candidate.id)}
                <option value={candidate.id}>{candidate.name}</option>
            {/each}
        </select>
        <p id={id + '-pic-help'} class="text-sm text-muted-foreground">
            {candidates.some(candidate => candidate.id === cycle.nurseId)
                ? 'Anda dapat memilih perawat aktif lain sebagai penanggung jawab tugas.'
                : 'Perawat penanggung jawab rekap tidak tersedia. Pilih perawat aktif lain.'}
        </p>
    </div>
    <div class="grid gap-1.5">
        <label for={id + '-priority'}>Prioritas</label>
        <FormSelect id={id + '-priority'} name="priority" options={[
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'Tinggi' },
            { value: 'low', label: 'Rendah' },
        ]} />
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-1.5">
            <label for={id + '-start'}>Waktu mulai (WIB, wajib)</label>
            <FormDatePicker id={id + '-start'} name="startsAt" type="datetime-local" required />
        </div>
        <div class="grid gap-1.5">
            <label for={id + '-end'}>Waktu selesai (WIB, wajib)</label>
            <FormDatePicker id={id + '-end'} name="endsAt" type="datetime-local" required />
        </div>
    </div>
    <div class="grid gap-1.5">
        <label for={id + '-description'}>Deskripsi</label>
        <Textarea id={id + '-description'} name="description" rows={2} maxlength={5000} />
    </div>
    <div class="grid gap-1.5">
        <label for={id + '-notes'}>Catatan awal</label>
        <Textarea id={id + '-notes'} name="notes" rows={2} maxlength={3000} />
    </div>
    <div class="form-actions">
        <Button type="submit" class="h-11" disabled={busy || needsRefresh || !placement}><Save aria-hidden="true" /> Simpan tugas</Button>
        <Button variant="outline" type="button" class="h-11" disabled={busy} onclick={onCancel}><X aria-hidden="true" /> Batal</Button>
    </div>
</form>
