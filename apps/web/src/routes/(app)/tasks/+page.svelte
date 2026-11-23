<script lang="ts">
import { page } from '$app/state';
import View from '$lib/features/tasks/presentation/TasksPage.svelte';
import { createTasks } from '$lib/app/composition/tasks';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const tasks = createTasks(fetch, { csrfToken });
</script>
<View {data} taskId={page.url.searchParams.get('task') ?? ''} cycleId={page.url.searchParams.get('cycle') ?? ''} {tasks} />
