<script lang="ts">
    import { page } from '$app/state';
    import ErrorPage from '$lib/app/shell/ErrorPage.svelte';

    const path = $derived(page.url.pathname);
    const list = $derived(path.startsWith('/medical-records/') ? { href: '/medical-records', label: 'Kembali ke daftar rekam medis' }
        : path.startsWith('/patients/') && page.data.user?.role === 'ADMISI' ? { href: '/patients', label: 'Kembali ke daftar pasien' }
        : { href: '/', label: 'Kembali ke halaman utama' });
</script>
<ErrorPage status={page.status} message={page.error?.publicMessage} back={list} />
