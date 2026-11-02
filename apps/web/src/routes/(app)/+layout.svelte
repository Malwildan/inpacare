<script lang="ts">
import AppShell from '$lib/app/shell/AppShell.svelte';
import { createAuth } from '$lib/app/composition/auth';
import { createNotifications } from '$lib/app/composition/notifications';
import { csrfToken } from '$lib/shared/presentation/session';
import type { LayoutData } from './$types';
let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
const auth = createAuth(fetch, { csrfToken });
const notificationService = createNotifications(fetch, { csrfToken });
</script>
<AppShell {data} {children} {auth} {notificationService} />
