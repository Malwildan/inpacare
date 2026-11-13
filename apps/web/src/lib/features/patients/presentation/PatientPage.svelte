<script lang="ts">
	import { Badge, type BadgeVariant } from '$lib/shared/ui/badge/index.js';
	import { Button } from '$lib/shared/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
	import { date } from '$lib/shared/format';
	import type { PatientPageData } from '$lib/features/patients';

	let { data }: {
		data: PatientPageData;
	} = $props();

	const labels: Record<string, string> = {
		pending: 'Pending',
		assigned: 'Assigned',
		in_care: 'In Care',
		extend: 'Extend',
		released: 'Pelepasan',
		active: 'Aktif',
		done: 'Selesai',
		cancelled: 'Dibatalkan'
	};

	const tones: Record<string, BadgeVariant> = {
		pending: 'warning',
		assigned: 'info',
		in_care: 'success',
		extend: 'info',
		released: 'outline',
		active: 'success',
		done: 'success',
		cancelled: 'destructive'
	};

	function label(value: string): string {
		return labels[value] ?? value;
	}

	function tone(value: string): BadgeVariant {
		return tones[value] ?? 'outline';
	}
</script>

<svelte:head><title>Ringkasan Pasien | InpaCare</title></svelte:head>

<div class="flex flex-col gap-6">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
		<div class="min-w-0">
			<h1 class="text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[28px]">Ringkasan Pasien</h1>
			<p class="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">Informasi pasien dan keterkaitan rawat inap.</p>
		</div>
		<Button variant="outline" class="h-11 shrink-0 px-4" href={data.user.role === 'ADMISI' ? '/invoices' : '/dashboard'}>Kembali</Button>
	</header>

	<Card>
		<CardHeader class="flex-row flex-wrap items-center justify-between gap-3">
			<div class="min-w-0">
				<CardTitle class="text-[19px]">{data.context.patient.name}</CardTitle>
				<CardDescription class="mt-1">Nomor rekam medis {data.context.patient.medicalRecordNo}</CardDescription>
			</div>
			<Badge variant="secondary">{data.context.patient.medicalRecordNo}</Badge>
		</CardHeader>
		<CardContent>
			<dl class="grid grid-cols-1 gap-5 sm:grid-cols-2">
				<div class="flex min-w-0 flex-col gap-1">
					<dt class="text-[13px] text-muted-foreground">Tanggal lahir</dt>
					<dd class="text-sm font-semibold">{date(data.context.patient.birthDate)}</dd>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<dt class="text-[13px] text-muted-foreground">Jenis kelamin</dt>
					<dd class="text-sm font-semibold">{data.context.patient.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</dd>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<dt class="text-[13px] text-muted-foreground">BPJS</dt>
					<dd class="text-sm font-semibold">{data.context.patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</dd>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<dt class="text-[13px] text-muted-foreground">Nomor BPJS</dt>
					<dd class="text-sm font-semibold">{data.context.patient.bpjsNumber ?? '—'}</dd>
				</div>
			</dl>
		</CardContent>
	</Card>

	<Card class="gap-0 py-0">
		<CardHeader class="flex-row flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
			<CardTitle class="text-[17px] font-semibold">Riwayat Penempatan</CardTitle>
			<a class="text-sm font-semibold text-primary hover:underline" href="/calendar">Lihat kalender</a>
		</CardHeader>
		<CardContent class="px-0">
			<Table>
				<TableHeader>
					<TableRow class="bg-muted/60 hover:bg-muted/60">
						<TableHead class="px-4 sm:px-5">Ruangan</TableHead>
						<TableHead>Tanggal masuk</TableHead>
						<TableHead>Tanggal selesai</TableHead>
						<TableHead class="px-4 sm:px-5">Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.context.placements as placement}
						<TableRow>
							<TableCell class="px-4 align-top font-medium whitespace-normal sm:px-5">{placement.roomName}</TableCell>
							<TableCell class="align-top whitespace-normal">{date(placement.startsOn)}</TableCell>
							<TableCell class="align-top whitespace-normal">{date(placement.endsOn)}</TableCell>
							<TableCell class="px-4 align-top sm:px-5"><Badge variant={tone(placement.status)}>{label(placement.status)}</Badge></TableCell>
						</TableRow>
					{:else}
						<TableRow class="hover:bg-transparent">
							<TableCell colspan={4} class="px-4 py-11 text-center text-sm whitespace-normal text-muted-foreground sm:px-5">Belum ada penempatan.</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</CardContent>
	</Card>

	{#if data.user.role !== 'ADMISI'}
		<Card>
			<CardHeader>
				<CardTitle class="text-[17px] font-semibold">Tim Perawatan</CardTitle>
			</CardHeader>
			<CardContent class="flex flex-col gap-5">
				{#each data.context.cycles as cycle}
					<dl class="grid grid-cols-1 gap-5 sm:grid-cols-3">
						<div class="flex min-w-0 flex-col gap-1">
							<dt class="text-[13px] text-muted-foreground">Dokter</dt>
							<dd class="text-sm font-semibold">{cycle.doctorName}</dd>
						</div>
						<div class="flex min-w-0 flex-col gap-1">
							<dt class="text-[13px] text-muted-foreground">Perawat</dt>
							<dd class="text-sm font-semibold">{cycle.nurseName}</dd>
						</div>
						<div class="flex min-w-0 flex-col gap-1">
							<dt class="text-[13px] text-muted-foreground">Status siklus</dt>
							<dd><Badge variant={tone(cycle.status)}>{label(cycle.status)}</Badge></dd>
						</div>
					</dl>
				{:else}
					<p class="text-sm text-muted-foreground">Belum ada rekap rawat inap.</p>
				{/each}
			</CardContent>
		</Card>
	{/if}
</div>
