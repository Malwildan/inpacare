<script lang="ts">
import View from '$lib/features/care-cycles/presentation/DashboardPage.svelte';
import { createCareCycles } from '$lib/app/composition/care-cycles';
import { createNotifications } from '$lib/app/composition/notifications';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const careCycles = createCareCycles(fetch, { csrfToken });
const notifications = createNotifications(fetch, { csrfToken });
</script>
<View {data} {careCycles} markNotificationRead={notifications.markRead} />
