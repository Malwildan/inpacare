<script lang="ts">
import { page } from '$app/state';
import View from '$lib/features/placements/presentation/CalendarPage.svelte';
import { createPlacements } from '$lib/app/composition/placements';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const placementService = createPlacements(fetch, { csrfToken });
</script>
<View {data} cycleId={page.url.searchParams.get('cycle') ?? ''} {placementService} />
