<script lang="ts">
import { Toaster as Sonner } from 'svelte-sonner';
</script>

<Sonner
    theme="light"
    position="top-right"
    richColors
    closeButton
    expand
    duration={6000}
    pauseWhenPageIsHidden
    containerAriaLabel="Notifikasi aplikasi"
    closeButtonAriaLabel="Tutup notifikasi"
    offset={{ top: 80, right: 24, bottom: 24, left: 24 }}
    mobileOffset={{ top: 80, right: 16, bottom: 16, left: 16 }}
    style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border); --success-bg: var(--success-soft); --success-text: var(--success); --error-bg: var(--danger-soft); --error-text: var(--danger); --info-bg: var(--primary-soft); --info-text: var(--primary); font-family: inherit;"
/>

<style>
    :global([data-sonner-toaster]) { pointer-events: auto; }
    :global([data-sonner-toast]) { overflow-wrap: anywhere; }
    :global([data-sonner-toaster] [data-sonner-toast][data-styled='true']) { padding-right: 48px; }
    :global([data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-close-button]) {
        top: 0;
        right: 0;
        left: auto;
        width: 44px;
        height: 44px;
        border: 0;
        background: transparent;
        transform: none;
    }
</style>
