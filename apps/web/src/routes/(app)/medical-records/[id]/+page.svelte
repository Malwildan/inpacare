<script lang="ts">
import View from '$lib/features/medical-records/presentation/MedicalDetailPage.svelte';
import { createMedicalRecords } from '$lib/app/composition/medical-records';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const medical = createMedicalRecords(fetch, { csrfToken });
</script>
<View {data} {medical} />
