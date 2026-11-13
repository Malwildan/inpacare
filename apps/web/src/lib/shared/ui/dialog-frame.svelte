<script lang="ts">
import { onMount, type Snippet } from 'svelte';
import * as Dialog from './dialog/index.js';

let { title, onclose, children, busy = false }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    busy?: boolean;
} = $props();
let opener: HTMLElement | null = null;
onMount(() => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => opener?.focus();
});
</script>

<!-- Keep callback-based dismissal controlled, including a caller that vetoes closing. -->
<Dialog.Root bind:open={() => true, (open) => { if (!open && !busy) onclose(); }}>
    <Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined} aria-busy={busy}
        showCloseButton={!busy}
        onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); opener?.focus(); }}>
        <Dialog.Header><Dialog.Title>{title}</Dialog.Title></Dialog.Header>
        {@render children()}
    </Dialog.Content>
</Dialog.Root>
