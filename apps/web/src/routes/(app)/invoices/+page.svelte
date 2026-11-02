<script lang="ts">
import View from '$lib/features/billing/presentation/BillingPage.svelte';
import { createBilling } from '$lib/app/composition/billing';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const billing = createBilling(fetch, { csrfToken });
</script>
<View {data} {billing} />
