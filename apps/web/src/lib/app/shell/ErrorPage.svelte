<script lang="ts">
import { ArrowLeft, LogIn } from 'lucide-svelte';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card, CardContent, CardHeader } from '$lib/shared/ui/card/index.js';
let { status, message, back }: { status: number; message: string | undefined; back: { href: string; label: string } } = $props();
const title = $derived(status === 403 ? 'Akses terbatas' : status === 404 ? 'Halaman atau data tidak tersedia' : 'Halaman gagal dimuat');
const fallback = $derived(status === 403 ? 'Akun Anda tidak memiliki akses ke halaman ini. Kembali ke halaman utama untuk melanjutkan.'
    : status === 404 ? 'Periksa alamat halaman atau kembali untuk memilih data yang tersedia.'
    : 'Muat ulang halaman untuk mencoba lagi. Jika masih gagal, kembali ke halaman utama.');
</script>
<svelte:head><title>{title} · InpaCare</title></svelte:head>
<main class="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
    <Card class="w-full max-w-xl text-center">
        <CardHeader class="gap-4">
            <a href="/login" class="text-xl font-bold tracking-tight text-primary">InpaCare <span class="text-xs font-medium text-muted-foreground">RSI</span></a>
            <p class="text-5xl font-semibold tabular-nums text-muted-foreground">{status}</p>
            <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
        </CardHeader>
        <CardContent class="space-y-6">
            <p class="break-words text-sm leading-relaxed text-muted-foreground">{message ?? fallback}</p>
            <div class="action-buttons mx-auto">
                <Button href={back.href} class="min-h-11"><ArrowLeft aria-hidden="true" /> {back.label}</Button>
                {#if status >= 500}<Button variant="outline" class="min-h-11" onclick={() => window.location.reload()}>Muat ulang halaman</Button>{/if}
                <Button href="/login" variant="outline" class="min-h-11"><LogIn aria-hidden="true" /> Halaman masuk</Button>
            </div>
        </CardContent>
    </Card>
</main>
