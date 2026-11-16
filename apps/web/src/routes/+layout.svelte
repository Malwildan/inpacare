<script lang="ts">
import '../app.css';
import { Toaster } from '$lib/shared/ui/sonner/index.js';
let { children } = $props();
</script>
<Toaster />
{@render children()}
