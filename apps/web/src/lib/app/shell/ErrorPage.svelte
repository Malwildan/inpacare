<script lang="ts">
import { Button } from '$lib/shared/ui/button/index.js';
import { Card, CardContent, CardHeader } from '$lib/shared/ui/card/index.js';
let { status, message }: { status: number; message: string | undefined } = $props();
</script>
<svelte:head><title>{status} · InpaCare</title></svelte:head>
<main class="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
    <Card class="w-full max-w-xl text-center">
        <CardHeader class="gap-4">
            <a href="/login" class="text-xl font-bold tracking-tight text-primary">InpaCare <span class="text-xs font-medium text-muted-foreground">RSI</span></a>
            <p class="text-5xl font-semibold tabular-nums text-muted-foreground">{status}</p>
            <h1 class="text-2xl font-semibold tracking-tight">{status === 403 ? 'Akses terbatas' : status === 404 ? 'Halaman tidak ditemukan' : 'Layanan belum tersedia'}</h1>
        </CardHeader>
        <CardContent class="space-y-6">
            <p class="break-words text-sm leading-relaxed text-muted-foreground">{message ?? 'Silakan coba kembali beberapa saat lagi.'}</p>
            <div class="flex flex-wrap justify-center gap-3">
                <Button href="/dashboard" class="min-h-11">Kembali ke aplikasi</Button>
                <Button href="/login" variant="outline" class="min-h-11">Halaman masuk</Button>
            </div>
        </CardContent>
    </Card>
</main>
