<script lang="ts">
    import { Pencil } from 'lucide-svelte';
    import { Button } from '$lib/shared/ui/button/index.js';
    import type { Observation } from '../domain/models';

    let { observations, correctAs, onCorrect }: {
        observations: Observation[];
        correctAs?: string;
        onCorrect?: (id: string) => void;
    } = $props();

    const dateTime = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta'
    });
    const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
    function measurement(value: number | null, unit: string) {
        return value == null ? '—' : `${number.format(value)} ${unit}`;
    }
</script>

<div class="divide-y">
    {#each observations as observation (observation.id)}
        <article class="py-5 first:pt-0 last:pb-0">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 class="font-medium">{observation.nurseName}</h3>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Diamati <time datetime={observation.observedAt}>{dateTime.format(new Date(observation.observedAt))} WIB</time>
                        · versi {observation.version}
                    </p>
                    <p class="text-sm text-muted-foreground">
                        Dicatat <time datetime={observation.createdAt}>{dateTime.format(new Date(observation.createdAt))} WIB</time>
                    </p>
                </div>
                {#if onCorrect && observation.nurseId === correctAs}
                    <Button variant="outline" size="sm" aria-haspopup="dialog" onclick={() => onCorrect?.(observation.id)}><Pencil aria-hidden="true" /> Koreksi observasi</Button>
                {/if}
            </div>
            <p class="mt-4 break-words whitespace-pre-wrap"><strong>Gejala/kondisi:</strong> {observation.symptoms}</p>
            {#if observation.nursingNote}
                <p class="mt-3 break-words whitespace-pre-wrap"><strong>Catatan:</strong> {observation.nursingNote}</p>
            {/if}
            <dl class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div><dt class="text-sm text-muted-foreground">Suhu</dt><dd>{measurement(observation.temperature, '°C')}</dd></div>
                <div><dt class="text-sm text-muted-foreground">Tekanan darah</dt><dd>{observation.bloodPressure ?? '—'}</dd></div>
                <div><dt class="text-sm text-muted-foreground">Nadi</dt><dd>{measurement(observation.pulse, 'bpm')}</dd></div>
                <div><dt class="text-sm text-muted-foreground">Pernapasan</dt><dd>{measurement(observation.respiratoryRate, '/menit')}</dd></div>
                <div><dt class="text-sm text-muted-foreground">Saturasi</dt><dd>{measurement(observation.spo2, '%')}</dd></div>
            </dl>
        </article>
    {:else}
        <p class="py-3 text-sm text-muted-foreground">Belum ada observasi keperawatan.</p>
    {/each}
</div>
