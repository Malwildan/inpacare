<script>
import AppShell from '$lib/app/shell/AppShell.svelte';
import LoginPage from '$lib/features/auth/presentation/LoginPage.svelte';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
import { Button } from '$lib/shared/ui/button/index.js';

let modal = $state(false);
let closes = $state(0);
let release;
let calls = 0;
const notificationService = {
    list: () => {
        calls++;
        if (calls === 1) {
            return new Promise((resolve, reject) => {
                release = () => reject(new Error('Gagal sintetis'));
            });
        }
        return Promise.resolve([{ id: 'n1', message: 'Sintetis', readAt: null, createdAt: '2026-01-01T00:00:00Z' }]);
    },
    markRead: async () => {}
};
window.releaseNotification = () => release();
window.callCount = () => calls;
const data = $state({ user: { id: '1', name: 'Test User', role: 'PERAWAT', coordinator: false }, reference: {} });
window.setRole = role => { data.user.role = role; };
</script>

<AppShell {data} auth={{ logout: async () => {} }} {notificationService}>
    <Button onclick={() => modal = true}>Open test modal</Button><span id="closes">{closes}</span>
    {#if modal}
        <Modal title="Test modal" description="Synthetic focus and keyboard fixture." onclose={() => { closes++; modal = false; }}><p>Content</p></Modal>
    {/if}
    <LoginPage auth={{ login: async () => data.user }} landingPage={() => '/dashboard'} />
</AppShell>
