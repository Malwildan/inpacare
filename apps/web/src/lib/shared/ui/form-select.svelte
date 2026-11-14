<script lang="ts">
import * as Select from './select/index.js';
import { cn } from '$lib/shared/utils';

let { options, value = $bindable(undefined), name, required = false, disabled = false,
    onValueChange, class: className, ...triggerProps }: {
    options: { value: string | null; label: string; disabled?: boolean }[];
    value?: string | null;
    name?: string;
    required?: boolean;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    id?: string;
    class?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
} = $props();

const selected = $derived(value === undefined ? options.find(option => !option.disabled)?.value ?? '' : value ?? '');
const items = $derived(options.map(option => ({ ...option, value: option.value ?? '' })));
function change(next: string) {
    const option = options.find(option => (option.value ?? '') === next);
    value = option ? option.value : next;
    onValueChange?.(next);
}
</script>

<!-- Compose registry Select once for repeated FormData-backed fields and filters. -->
<Select.Root type="single" {name} {required} {disabled} {items} bind:value={() => selected, change}>
    <Select.Trigger {...triggerProps} data-value={selected} class={cn('h-11 w-full min-w-0 text-base data-[size=default]:h-11 md:text-sm', className)}>
        <Select.Value placeholder={items.find(option => option.value === '')?.label ?? 'Pilih opsi'} />
    </Select.Trigger>
    <Select.Content class="max-h-[min(20rem,var(--bits-select-content-available-height))] min-w-(--bits-select-anchor-width) max-w-[calc(100vw-2rem)]">
        {#each items as option (option.value)}
            <Select.Item value={option.value} label={option.label} disabled={option.disabled}
                class="min-h-11 py-2 pr-8 pl-3 [&>span:last-child]:min-w-0 [&>span:last-child]:shrink [&>span:last-child]:whitespace-normal" />
        {/each}
    </Select.Content>
</Select.Root>
