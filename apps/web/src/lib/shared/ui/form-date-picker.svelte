<script lang="ts">
import { DateFormatter, parseDate, type DateValue } from '@internationalized/date';
import { CalendarDays, Check, X } from 'lucide-svelte';
import { Button } from './button/index.js';
import { Calendar } from './calendar/index.js';
import { Input } from './input/index.js';
import { Label } from './label/index.js';
import * as Popover from './popover/index.js';
import { cn } from '$lib/shared/utils';
import { toast } from './sonner/index.js';

const autoId = $props.id();
let {
    value = $bindable(''), name, id = autoId, type = 'date', required = false,
    disabled = false, max, captionLayout = 'label', years, class: className, ...triggerProps
}: {
    value?: string;
    name?: string;
    id?: string;
    type?: 'date' | 'datetime-local';
    required?: boolean;
    disabled?: boolean;
    max?: string;
    captionLayout?: 'label' | 'dropdown' | 'dropdown-months' | 'dropdown-years';
    years?: number[];
    class?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
} = $props();

let open = $state(false);
let invalid = $state(false);
let trigger = $state<HTMLButtonElement | null>(null);
const formatter = new DateFormatter('id-ID', { dateStyle: 'medium', timeZone: 'UTC' });
const date = $derived.by(() => {
    try {
        return value.split('T')[0] ? parseDate(value.split('T')[0]) : undefined;
    } catch {
        // Invalid dates from URL filters should leave the picker empty.
        return undefined;
    }
});
const time = $derived(value.split('T')[1] ?? '');
const withTime = $derived(type === 'datetime-local');
const maximum = $derived(max ? parseDate(max) : undefined);
// Keep the API's date-only / local date-time strings, without timezone conversion.
const formValue = $derived(date && (!maximum || date.compare(maximum) <= 0) && (!withTime || time) ? value : '');

function selectDate(next: DateValue | undefined) {
    value = next ? next.toString() + (withTime ? `T${time}` : '') : '';
    invalid = false;
    if (!withTime) open = false;
}

function requireValue(event: Event & { currentTarget: HTMLInputElement }) {
    event.preventDefault();
    invalid = true;
    const input = event.currentTarget;
    // Only the first invalid field should take focus during form validation.
    if (input.form?.querySelector('input:invalid, select:invalid, textarea:invalid') === input) {
        trigger?.focus();
        const label = trigger?.labels?.[0]?.childNodes[0]?.textContent?.trim() || triggerProps['aria-label'];
        const prompt = withTime ? 'Pilih tanggal dan jam' : 'Pilih tanggal';
        toast.error(label ? `${prompt} untuk ${label}.` : `${prompt}.`, { id: 'date-validation' });
    }
}
</script>

<Popover.Root bind:open>
    <Popover.Trigger {disabled}>
        {#snippet child({ props })}
            <Button {...props} {...triggerProps} {id} bind:ref={trigger} variant="outline"
                data-slot="date-picker" data-value={formValue} aria-invalid={invalid || undefined}
                class={cn('h-11 w-full min-w-0 justify-between gap-2 px-3 text-left text-base font-normal md:text-sm', !date && 'text-muted-foreground', className)}>
                <span class="truncate">{date ? formatter.format(date.toDate('UTC')) : 'Pilih tanggal'}{#if date && withTime} · {time || 'Pilih waktu'}{/if}</span>
                <CalendarDays class="size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
        {/snippet}
    </Popover.Trigger>
    <Popover.Content align="start" class="w-auto max-w-[calc(100vw-1rem)] gap-0 p-0">
        <Calendar type="single" value={date} onValueChange={selectDate} locale="id-ID"
            initialFocus preventDeselect={required} {disabled} {captionLayout} {years} maxValue={maximum} calendarLabel="Pilih tanggal" />
        {#if withTime}
            <div class="grid gap-2 border-t p-3">
                <Label for={`${id}-time`}>Waktu</Label>
                <Input id={`${id}-time`} type="time" value={time} {disabled} class="h-11 text-base"
                    oninput={(event) => { value = `${date?.toString() ?? ''}T${event.currentTarget.value}`; invalid = false; }} />
                <Button class="h-11" disabled={!formValue} onclick={() => open = false}><Check aria-hidden="true" /> Selesai</Button>
            </div>
        {/if}
        {#if !required && value}
            <div class="border-t p-2">
                <Button variant="ghost" class="h-11 w-full" onclick={() => { value = ''; invalid = false; open = false; }}><X aria-hidden="true" /> Hapus tanggal</Button>
            </div>
        {/if}
    </Popover.Content>
</Popover.Root>
<!-- A visually hidden text input preserves native required validation and FormData. -->
<input type="text" class="sr-only" tabindex="-1" aria-hidden="true" {name}
    value={formValue} {required} {disabled} oninvalid={requireValue} />
