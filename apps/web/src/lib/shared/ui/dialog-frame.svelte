<script lang="ts">
import { onMount, tick, type Snippet } from 'svelte';
import { ArrowLeft, Pencil, X } from 'lucide-svelte';
import * as Dialog from './dialog/index.js';
import { Button } from './button/index.js';

let { title, description, onclose, children, busy = false, protectChanges = false, formKey = '', backLabel, wide = false, initialFocus }: {
    title: string;
    description?: string;
    onclose: () => void;
    children: Snippet<[close: () => void]>;
    busy?: boolean;
    protectChanges?: boolean;
    formKey?: string;
    backLabel?: string;
    wide?: boolean;
    initialFocus?: string;
} = $props();
let opener: HTMLElement | null = null;
let body = $state<HTMLDivElement | null>(null);
let confirmation = $state<HTMLDivElement | null>(null);
let discarding = $state(false);
let previousFocus: HTMLElement | null = null;
let initial = '';
let previousKey: string | undefined;
const returnTargets = new Map<string, { label: string; index: number }>();
function rememberAction(event: MouseEvent) {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button && body) returnTargets.set(formKey, {
        label: button.textContent?.trim() ?? '',
        index: Array.from(body.querySelectorAll('button')).indexOf(button)
    });
}
function snapshot() {
    return JSON.stringify(Array.from(body?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select, [role="combobox"], [data-slot="date-picker"]') ?? [])
        .map(field => [field.getAttribute('name'), field.getAttribute('data-value') ?? field.value, field instanceof HTMLInputElement ? field.checked : null]));
}
$effect(() => {
    const key = formKey;
    const element = body;
    const changedView = previousKey !== undefined && previousKey !== key;
    previousKey = key;
    discarding = false;
    let active = true;
    void tick().then(() => {
        if (!active || !element) return;
        initial = snapshot();
        if (changedView) {
            element.scrollTop = 0;
            const saved = returnTargets.get(key);
            const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button'));
            const indexed = saved ? buttons[saved.index] : null;
            const target = saved ? indexed?.textContent?.trim() === saved.label ? indexed : buttons.find(button => button.textContent?.trim() === saved.label) : null;
            (target ?? element.querySelector<HTMLElement>('input:not([type="hidden"]):not([aria-hidden="true"]), textarea, [role="combobox"], button:not([disabled])'))?.focus();
        }
    });
    return () => { active = false; };
});
onMount(() => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
});
async function close() {
    if (busy) return;
    if (discarding) { await continueEditing(); return; }
    if (protectChanges && snapshot() !== initial) {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        discarding = true;
        await tick();
        confirmation?.querySelector<HTMLButtonElement>('button')?.focus();
    } else onclose();
}
async function continueEditing() {
    discarding = false;
    await tick();
    previousFocus?.focus();
}
</script>

<Dialog.Root bind:open={() => true, (open) => { if (!open) void close(); }}>
    <Dialog.Content class={`dialog-frame flex max-h-[100dvh] max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl ${wide ? 'sm:max-w-6xl' : 'sm:max-w-3xl'}`} aria-busy={busy}
        showCloseButton={!busy}
        onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busy || discarding) event.preventDefault(); }}
        onOpenAutoFocus={(event) => {
            const target = initialFocus && body?.querySelector<HTMLElement>(initialFocus);
            if (target) {
                event.preventDefault();
                target.focus();
            }
        }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (opener?.isConnected) opener.focus(); }}>
        <Dialog.Header class="shrink-0 border-b p-5 pr-14 text-left">
            <Dialog.Title>{discarding ? 'Abaikan perubahan?' : title}</Dialog.Title>
            {#if discarding || description}<Dialog.Description>{discarding ? 'Perubahan belum disimpan. Lanjutkan mengisi atau abaikan perubahan untuk kembali.' : description}</Dialog.Description>{/if}
        </Dialog.Header>
        {#if discarding}
            <div bind:this={confirmation} class="flex flex-wrap justify-end gap-2 p-5">
                <Button class="h-11" onclick={continueEditing}><Pencil aria-hidden="true" /> Lanjutkan mengisi</Button>
                <Button variant="destructive" class="h-11" onclick={onclose}><X aria-hidden="true" /> Abaikan perubahan</Button>
            </div>
        {/if}
        <div bind:this={body} class="dialog-body min-h-0 min-w-0 flex-1 overflow-y-auto p-5" hidden={discarding} onclickcapture={rememberAction}>
            {#if backLabel}<Button variant="ghost" class="mb-4 h-11" disabled={busy} onclick={close}><ArrowLeft aria-hidden="true" /> {backLabel}</Button>{/if}
            {@render children(close)}
        </div>
    </Dialog.Content>
</Dialog.Root>

<style>
    .dialog-body[hidden] { display: none; }
    .dialog-body :global(form) { min-width: 0; }
    .dialog-body :global(.form-actions), .dialog-body :global([data-slot="dialog-footer"]) {
        position: sticky; bottom: -20px; z-index: 2; display: flex; flex-wrap: wrap; justify-content: flex-end;
        grid-column: 1 / -1; gap: 8px; margin-top: 20px; padding: 16px 0; background: var(--popover); border-top: 1px solid var(--border);
    }
    @media (max-width: 639px) { :global(.dialog-frame) { height: 100dvh; } }
</style>
