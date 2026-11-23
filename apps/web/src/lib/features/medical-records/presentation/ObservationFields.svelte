<script lang="ts">
    import { Field, FieldGroup, FieldLabel } from '$lib/shared/ui/field/index.js';
    import { Input } from '$lib/shared/ui/input/index.js';
    import { Textarea } from '$lib/shared/ui/textarea/index.js';
    import { observationLocalTime } from './observation-form';
    import type { Observation } from '../domain/models';

    let { observation }: { observation?: Observation } = $props();
    const id = $props.id();
    const observedAt = $derived(observationLocalTime(observation ? new Date(observation.observedAt) : new Date()));
    const vitalFields = [
        { name: 'temperature', label: 'Suhu (°C)', min: 30, max: 45, step: 0.01 },
        { name: 'systolic', label: 'Sistolik (mmHg)', min: 50, max: 250, step: 1 },
        { name: 'diastolic', label: 'Diastolik (mmHg)', min: 30, max: 150, step: 1 },
        { name: 'pulse', label: 'Nadi (bpm)', min: 20, max: 250, step: 1 },
        { name: 'respiratoryRate', label: 'Pernapasan (/menit)', min: 5, max: 60, step: 1 },
        { name: 'spo2', label: 'Saturasi O₂ (%)', min: 50, max: 100, step: 0.01 },
    ] as const;
</script>

<FieldGroup class="grid gap-4 sm:grid-cols-2">
    <Field class="sm:col-span-2">
        <FieldLabel for="{id}-time">Waktu observasi (WIB)</FieldLabel>
        <Input id="{id}-time" name="observedAt" type="datetime-local" value={observedAt} required />
    </Field>
    <Field>
        <FieldLabel for="{id}-symptoms">Gejala/kondisi</FieldLabel>
        <Textarea id="{id}-symptoms" name="symptoms" value={observation?.symptoms ?? ''} rows={3} required maxlength={3000} />
    </Field>
    <Field>
        <FieldLabel for="{id}-note">Catatan keperawatan</FieldLabel>
        <Textarea id="{id}-note" name="nursingNote" value={observation?.nursingNote ?? ''} rows={3} maxlength={3000} />
    </Field>
</FieldGroup>
<fieldset aria-describedby="{id}-blood-pressure">
    <legend class="mb-1 font-medium">Tanda vital (opsional)</legend>
    <p id="{id}-blood-pressure" class="mb-3 text-sm text-muted-foreground">Isi Sistolik dan Diastolik bersama, atau kosongkan keduanya.</p>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each vitalFields as { name, label, min, max, step } (name)}
            <Field>
                <FieldLabel for="{id}-{name}">{label}</FieldLabel>
                <Input id="{id}-{name}" {name} type="number" {min} {max} {step} value={observation?.[name] ?? ''} />
            </Field>
        {/each}
    </div>
</fieldset>
