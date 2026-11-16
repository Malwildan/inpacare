<script lang="ts">
import Modal from '$lib/shared/ui/dialog-frame.svelte';
	import { toast } from '$lib/shared/ui/sonner/index.js';
	import { goto } from '$app/navigation';
	import type { MedicalRecords, MedicalListData } from '$lib/features/medical-records';
	import { sessionFailure } from '$lib/shared/presentation/session';
	import { formText } from '$lib/shared/presentation/form';
	import { ArrowRight, Plus, Save, X } from 'lucide-svelte';
	import { Button } from '$lib/shared/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
	import { Field, FieldGroup, FieldLabel } from '$lib/shared/ui/field/index.js';
	import FormDatePicker from '$lib/shared/ui/form-date-picker.svelte';
	import { Input } from '$lib/shared/ui/input/index.js';
	import FormSelect from '$lib/shared/ui/form-select.svelte';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
	import { Textarea } from '$lib/shared/ui/textarea/index.js';

	let { data, medical }: {
		data: MedicalListData;
		medical: MedicalRecords;
	} = $props();

	let search = $state('');
	let creating = $state(false);
	let busy = $state(false);

	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
	const doctors = $derived(data.user.role === 'DOKTER');
	const admisi = $derived(data.admisiProjection);
	const filtered = $derived(data.records.filter((r) => !search || `${r.patientName} ${r.medicalRecordNo} ${r.diagnosis ?? ''}`.toLowerCase().includes(search.toLowerCase())));

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const f = new FormData(event.currentTarget as HTMLFormElement);
		busy = true;
		try {
			const row = await medical.create({
				patientId: formText(f, 'patientId'),
				complaint: formText(f, 'complaint'),
				diagnosis: formText(f, 'diagnosis'),
				treatment: formText(f, 'treatment'),
				notes: formText(f, 'notes'),
				recordDate: formText(f, 'recordDate')
			});
			creating = false;
			await goto(`/medical-records/${row.id}`, { invalidateAll: true });
			toast.success('Rekam medis tersimpan.');
		} catch (e) {
			toast.error(sessionFailure(e));
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Rekam Medis | InpaCare</title></svelte:head>

<div class="flex flex-col gap-6">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
		<div class="min-w-0">
			<h1 class="text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[28px]">Daftar Rekam Medis</h1>
			<p class="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
				{admisi ? 'Proyeksi administrasi baca saja: identitas catatan dan tanggal.' : 'Catatan dokter dan observasi keperawatan pasien rawat inap.'}
			</p>
		</div>
		{#if doctors}
			<Button
				class="h-11 shrink-0 px-4"
				aria-haspopup="dialog"
				onclick={() => {
					creating = !creating;
				}}
			>
				<Plus aria-hidden="true" /> Tambah rekam medis
			</Button>
		{/if}
	</header>

	<section aria-label="Ringkasan rekam medis" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
		<Card>
			<CardHeader class="gap-0.5">
				<CardTitle class="text-2xl font-semibold tabular-nums">{data.records.length}</CardTitle>
				<CardDescription class="text-[13px]">{admisi ? 'Catatan administratif tersedia' : 'Catatan dalam cakupan Anda'}</CardDescription>
			</CardHeader>
		</Card>
		{#if !admisi}
			<Card>
				<CardHeader class="gap-0.5">
					<CardTitle class="text-2xl font-semibold tabular-nums">{data.records.filter((r) => r.recordDate === today).length}</CardTitle>
					<CardDescription class="text-[13px]">Rekam medis hari ini</CardDescription>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader class="gap-0.5">
					<CardTitle class="text-2xl font-semibold tabular-nums">{data.records.reduce((n: number, r) => n + Number(r.observationCount), 0)}</CardTitle>
					<CardDescription class="text-[13px]">Observasi tersimpan</CardDescription>
				</CardHeader>
			</Card>
		{/if}
	</section>

	{#if creating && doctors}
		<Modal title="Tambah rekam medis" description="Catat keluhan, diagnosis, tindakan, dan catatan medis pasien." {busy} protectChanges wide onclose={() => creating = false}>
		{#snippet children(close)}<form class="flex flex-col gap-5" onsubmit={create}>
					<FieldGroup class="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel for="record-patient">Pasien</FieldLabel>
							<FormSelect id="record-patient" name="patientId" required class="w-full" options={[{ value: "", label: "Pilih pasien yang ditangani" }, ...(data.reference.patients).map((patient) => ({ value: patient.id, label: (patient.name) + " · " + (patient.medicalRecordNo) }))]} />
						</Field>
						<Field>
							<FieldLabel for="record-date">Tanggal rekam medis</FieldLabel>
							<FormDatePicker id="record-date" type="date" name="recordDate" value={today} required class="h-11 px-3 text-base md:text-base" />
						</Field>
						<Field class="sm:col-span-2">
							<FieldLabel for="record-complaint">Keluhan</FieldLabel>
							<Textarea id="record-complaint" name="complaint" rows={2} required maxlength={5000} class="text-base md:text-sm" />
						</Field>
						<Field class="sm:col-span-2">
							<FieldLabel for="record-diagnosis">Diagnosis</FieldLabel>
							<Textarea id="record-diagnosis" name="diagnosis" rows={2} required maxlength={5000} class="text-base md:text-sm" />
						</Field>
						<Field class="sm:col-span-2">
							<FieldLabel for="record-treatment">Tindakan</FieldLabel>
							<Textarea id="record-treatment" name="treatment" rows={2} required maxlength={5000} class="text-base md:text-sm" />
						</Field>
						<Field class="sm:col-span-2">
							<FieldLabel for="record-notes">Catatan medis</FieldLabel>
							<Textarea id="record-notes" name="notes" rows={2} maxlength={5000} class="text-base md:text-sm" />
						</Field>
					</FieldGroup>
					<div class="form-actions">
						<Button type="button" variant="outline" class="h-11 px-4" onclick={close}><X aria-hidden="true" /> Batal</Button>
						<Button type="submit" class="h-11 px-4" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan rekam medis'}</Button>
					</div>
				</form>{/snippet}
		</Modal>
	{/if}

	<Card class="gap-0 py-0">
		<CardHeader class="gap-1 border-b px-4 py-4 sm:px-5">
			<CardTitle role="heading" aria-level={2} class="text-[17px] font-semibold">Daftar catatan</CardTitle>
			<CardDescription>Menampilkan {filtered.length} dari {data.records.length} catatan</CardDescription>
		</CardHeader>
		<CardContent class="px-0">
			<div class="border-b px-4 py-4 sm:px-5">
				<Field class="max-w-[560px]">
					<FieldLabel for="record-search">Cari pasien atau rekam medis</FieldLabel>
					<Input
						id="record-search"
						type="search"
						bind:value={search}
						placeholder="Nama pasien, nomor RM, diagnosis"
						class="h-11 px-3 text-base md:text-base"
					/>
				</Field>
			</div>

			<Table class="data-table">
				<TableHeader>
					<TableRow class="bg-muted/60 hover:bg-muted/60">
						<TableHead class="px-4 sm:px-5">No. RM / pasien</TableHead>
						{#if !admisi}<TableHead>Diagnosis</TableHead>{/if}
						<TableHead>Tanggal</TableHead>
						{#if !admisi}
							<TableHead>Dokter</TableHead>
							<TableHead>Observasi</TableHead>
						{/if}
						<TableHead class="px-4 text-right sm:px-5">Aksi</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each filtered as record (record.id)}
						<TableRow>
							<TableCell class="px-4 align-top whitespace-normal sm:px-5">
								<span class="block text-sm font-semibold text-foreground">{record.patientName}</span>
								<span class="mt-1 block text-xs text-muted-foreground">{record.medicalRecordNo}</span>
							</TableCell>
							{#if !admisi}
								<TableCell class="align-top whitespace-normal">{record.diagnosis}</TableCell>
							{/if}
							<TableCell class="align-top whitespace-normal tabular-nums">
								{new Date(record.recordDate + 'T12:00:00').toLocaleDateString('id-ID')}
							</TableCell>
							{#if !admisi}
								<TableCell class="align-top whitespace-normal">{record.doctorName}</TableCell>
								<TableCell class="align-top tabular-nums">{record.observationCount}</TableCell>
							{/if}
							<TableCell class="px-4 align-top text-right sm:px-5">
								<Button variant="outline" class="h-11 px-3 text-[13px] no-underline hover:no-underline" href={'/medical-records/' + record.id}>
									Lihat detail <ArrowRight size={14} aria-hidden="true" />
								</Button>
							</TableCell>
						</TableRow>
					{:else}
						<TableRow class="hover:bg-transparent">
							<TableCell colspan={admisi ? 3 : 6} class="px-4 py-11 text-center text-sm whitespace-normal text-muted-foreground sm:px-5">
								Tidak ada rekam medis dalam cakupan Anda.
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</CardContent>
	</Card>
</div>
