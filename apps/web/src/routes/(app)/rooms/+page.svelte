<script lang="ts">
import { page } from '$app/state';
import View from '$lib/features/rooms/presentation/RoomsPage.svelte';
import { createRooms } from '$lib/app/composition/rooms';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const roomService = createRooms(fetch, { csrfToken });
</script>
<View {data} {roomService} cycleId={page.url.searchParams.get('cycle') ?? ''} roomSearch={page.url.searchParams.get('search') ?? ''} />
