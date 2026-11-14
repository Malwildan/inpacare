<script lang="ts">
import { moneyInputValue, parseMoneyInput, updateMoneyInput } from '$lib/shared/format/currency';
import { Field, FieldLabel } from '$lib/shared/ui/field/index.js';
import { Input } from '$lib/shared/ui/input/index.js';

const autoId = $props.id();
let { label, value = $bindable(''), name, id = autoId, required = false, disabled = false, hint = '', class: className = '' }: {
    label: string;
    value?: string;
    name?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    hint?: string;
    class?: string;
} = $props();

function inputAmount(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    updateMoneyInput(input, event instanceof InputEvent ? event.inputType : '');
    // Keep invalid text visible; the visible input's pattern blocks form submission.
    value = parseMoneyInput(input.value) ?? input.value;
}
</script>

<Field class={`field ${className}`}>
    <FieldLabel for={id}>{label}</FieldLabel>
    <div class="relative min-w-0">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">Rp</span>
        <Input {id} type="text" inputmode="decimal" value={moneyInputValue(value)} class="h-11 pl-[42px] pr-3 text-base md:text-base tabular-nums"
            pattern={String.raw`(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?`}
            title="Masukkan jumlah rupiah tanpa angka negatif, maksimal 2 angka desimal. Contoh: 250.000,50."
            placeholder="250.000" {required} {disabled}
            aria-describedby={hint ? `${id}-hint` : undefined}
            onfocus={(event) => { if (event.currentTarget.value === '0') event.currentTarget.select(); }}
            oninput={inputAmount} />
    </div>
    {#if name}<input type="hidden" {name} {value} {disabled} />{/if}
    {#if hint}<small class="text-muted-foreground" id={`${id}-hint`}>{hint}</small>{/if}
</Field>
