<script lang="ts">
import LoginPage from '$lib/features/auth/presentation/LoginPage.svelte';
import { createAuth } from '$lib/app/composition/auth';
import { landingPage } from '$lib/app/navigation';
import { csrfToken } from '$lib/shared/presentation/session';
const auth = createAuth(fetch, { csrfToken });
</script>
<LoginPage {auth} {landingPage} />
