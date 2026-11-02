<script lang="ts">
import PatientPage from '$lib/features/patients/presentation/PatientPage.svelte';
import type { PageData } from './$types';
let { data }: { data: PageData } = $props();
</script>
<PatientPage {data} />
