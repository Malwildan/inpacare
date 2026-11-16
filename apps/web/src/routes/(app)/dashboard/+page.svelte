<script lang="ts">
import View from '$lib/features/care-cycles/presentation/DashboardPage.svelte';
import { createNotifications } from '$lib/app/composition/notifications';
import { createCareCycles } from '$lib/app/composition/care-cycles';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const notificationService = createNotifications(fetch, { csrfToken });
const careCycles = createCareCycles(fetch, { csrfToken });
</script>
<View {data} {careCycles} {notificationService} />
