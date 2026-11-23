<script lang="ts">
    import { onMount } from 'svelte';
    import { Plus, Save, X } from 'lucide-svelte';
    import { Button } from '$lib/shared/ui/button/index.js';
    import { ObservationFields, ObservationList, readObservationForm, type Observation } from '$lib/features/medical-records';
    import { sessionFailure } from '$lib/shared/presentation/session';
    import type { CareCycles } from '../application/care-cycles';

    let { cycleId, canRecord, careCycles, onCancel, editing = $bindable(false), busy = $bindable(false) }: {
        cycleId: string;
        canRecord: boolean;
        careCycles: CareCycles;
        busy?: boolean;
        editing?: boolean;
        onCancel: () => void;
    } = $props();

    const id = $props.id();
    let observations = $state<Observation[] | null>(null);
    let loading = $state(true);
    let loadError = $state('');
    let saveError = $state('');
    let saved = $state(false);

    async function load() {
        loading = true;
        loadError = '';
        try {
            observations = await careCycles.observations(cycleId);
        } catch (failure) {
            loadError = sessionFailure(failure, 'load', 'Observasi keperawatan');
        } finally {
            loading = false;
        }
    }
    onMount(() => { void load(); });

    async function save(event: SubmitEvent) {
        event.preventDefault();
        if (busy || !canRecord) return;
        busy = true;
        saveError = '';
        saved = false;
        try {
            const form = new FormData(event.currentTarget as HTMLFormElement);
            observations = await careCycles.addObservation(cycleId, readObservationForm(form));
            editing = false;
            saved = true;
        } catch (failure) {
            saveError = sessionFailure(failure, 'save', 'observasi keperawatan');
        } finally {
            busy = false;
        }
    }
</script>

<div class="flex flex-col gap-5">
    {#if editing}
        <form class="flex flex-col gap-4" aria-labelledby="{id}-form" onsubmit={save}>
            <h3 id="{id}-form" class="font-semibold">Tambah observasi</h3>
            <ObservationFields />
            <p class="text-sm text-destructive" role="alert">{saveError}</p>
            <div class="flex flex-wrap justify-end gap-3">
                <Button variant="outline" type="button" disabled={busy} onclick={onCancel}><X aria-hidden="true" /> Batal</Button>
                <Button type="submit" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan observasi'}</Button>
            </div>
        </form>
    {:else if canRecord && observations}
        <div>
            <Button variant="outline" type="button" onclick={() => { editing = true; saveError = ''; saved = false; }}><Plus aria-hidden="true" /> Tambah observasi</Button>
        </div>
    {/if}
    <p class="empty:hidden text-sm" role="status">{saved ? 'Observasi tersimpan.' : ''}</p>
    {#if loading}
        <p class="text-sm text-muted-foreground" role="status">Memuat observasi…</p>
    {:else if loadError}
        <p class="text-sm text-destructive" role="alert">{loadError}</p>
        <div><Button variant="outline" type="button" onclick={load}>Muat ulang observasi</Button></div>
    {:else if observations}
        <ObservationList {observations} />
    {/if}
</div>
