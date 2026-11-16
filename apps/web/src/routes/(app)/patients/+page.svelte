<script lang="ts">
import View from '$lib/features/patients/presentation/PatientListPage.svelte';
import { createPatients } from '$lib/app/composition/patients';
import { csrfToken } from '$lib/shared/presentation/session';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
const patients = createPatients(fetch, { csrfToken });
</script>

<View {data} {patients} />
