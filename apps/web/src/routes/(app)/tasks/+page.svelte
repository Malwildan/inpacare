<script lang="ts">
import View from '$lib/features/tasks/presentation/TasksPage.svelte';
import { createTasks } from '$lib/app/composition/tasks';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const tasks = createTasks(fetch, { csrfToken });
</script>
<View {data} {tasks} />
