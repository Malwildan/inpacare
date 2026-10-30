<script lang="ts">
 import { onMount, type Snippet } from 'svelte'; import { X } from 'lucide-svelte';
 let { title, onclose, children }: {title:string; onclose:()=>void; children:Snippet} = $props(); let dialog:HTMLDialogElement;
 onMount(() => { dialog.showModal(); return () => dialog?.close(); });
</script>
<dialog bind:this={dialog} oncancel={(event)=>{event.preventDefault();onclose();}} onclick={(event)=>{if(event.target===dialog)onclose();}} onkeydown={(event)=>{if(event.key==='Escape')onclose();}}>
 <div class="modal-content"><div class="modal-header"><h2>{title}</h2><button class="icon-button" aria-label="Tutup" onclick={onclose}><X size={20}/></button></div>{@render children()}</div>
</dialog>
