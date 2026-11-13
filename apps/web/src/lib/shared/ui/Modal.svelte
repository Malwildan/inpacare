<script lang="ts">
import { onMount, type Snippet } from 'svelte';
import { X } from 'lucide-svelte';
let { title, onclose, children }: {
    title: string;
    onclose: () => void;
    children: Snippet;
} = $props();
let dialog: HTMLDialogElement;
onMount(() => {
 const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
 dialog.showModal();
 return () => { dialog?.close(); previousFocus?.focus(); };
});
</script>
<dialog aria-label={title} bind:this={dialog} oncancel={(event)=>{event.preventDefault();onclose();}} onclick={(event)=>{if(event.target===dialog)onclose();}}>
 <div class="modal-content"><div class="modal-header"><h2>{title}</h2><button class="icon-button" aria-label="Tutup" onclick={onclose}><X size={20}/></button></div>{@render children()}</div>
</dialog>
