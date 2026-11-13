<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { MedicalRecords, MedicalDetailData, Observation } from '$lib/features/medical-records';
	import { sessionFailure } from '$lib/shared/presentation/session';
	import { formText } from '$lib/shared/presentation/form';
	import { Alert, AlertDescription } from '$lib/shared/ui/alert/index.js';
	import { Badge } from '$lib/shared/ui/badge/index.js';
	import { Button } from '$lib/shared/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/shared/ui/dialog/index.js';
	import { Field, FieldGroup, FieldLabel } from '$lib/shared/ui/field/index.js';
	import { Input } from '$lib/shared/ui/input/index.js';
	import { Textarea } from '$lib/shared/ui/textarea/index.js';

	let { data, medical }: { data: MedicalDetailData; medical: MedicalRecords } = $props();
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let editingObservation = $state<string | null>(null);
	let observeOpen = $state(false);
	let archiveOpen = $state(false);
	let archiveReason = $state('');
	let archiveError = $state('');
	const record = $derived(data.record);
	const canEdit = $derived(data.user.role === 'DOKTER' && data.user.id === record.doctorId);
	const canObserve = $derived(data.user.role === 'PERAWAT');

	async function send(operation: () => Promise<unknown>) {
		if (busy) return;
		busy = true;
		error = '';
		notice = '';
		try {
			await operation();
			await invalidateAll();
			editingObservation = null;
			notice = 'Perubahan tersimpan.';
		} catch (e) {
			error = sessionFailure(e);
		} finally {
			busy = false;
		}
	}

	async function update(event: SubmitEvent) {
		event.preventDefault();
		const f = new FormData(event.currentTarget as HTMLFormElement);
		await send(() => medical.update(record.id, {
			expectedVersion: record.version!,
			complaint: formText(f, 'complaint'),
			diagnosis: formText(f, 'diagnosis'),
			treatment: formText(f, 'treatment'),
			notes: formText(f, 'notes'),
			recordDate: formText(f, 'recordDate'),
			reason: formText(f, 'reason')
		}));
	}

	async function observe(event: SubmitEvent) {
		event.preventDefault();
		const f = new FormData(event.currentTarget as HTMLFormElement);
		const number = (key: string) => {
			const value = String(f.get(key) ?? '').trim();
			return value === '' ? undefined : Number(value);
		};
		await send(() => medical.observe(record.id, {
			symptoms: formText(f, 'symptoms'),
			nursingNote: formText(f, 'nursingNote') || undefined,
			observedAt: new Date().toISOString(),
			temperature: number('temperature'),
			systolic: number('systolic'),
			diastolic: number('diastolic'),
			pulse: number('pulse'),
			respiratoryRate: number('respiratoryRate'),
			spo2: number('spo2')
		}));
	}

	async function correctObservation(event: SubmitEvent, observation: Observation) {
		event.preventDefault();
		const f = new FormData(event.currentTarget as HTMLFormElement);
		const number = (key: string) => {
			const value = String(f.get(key) ?? '').trim();
			return value === '' ? undefined : Number(value);
		};
		await send(() => medical.correctObservation(record.id, observation.id, {
			expectedVersion: observation.version,
			reason: formText(f, 'reason'),
			symptoms: formText(f, 'symptoms'),
			nursingNote: formText(f, 'nursingNote') || undefined,
			observedAt: new Date(String(formText(f, 'observedAt'))).toISOString(),
			temperature: number('temperature'),
			systolic: number('systolic'),
			diastolic: number('diastolic'),
			pulse: number('pulse'),
			respiratoryRate: number('respiratoryRate'),
			spo2: number('spo2')
		}));
	}

	async function archive(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const reason = archiveReason.trim();
		if (!reason) {
			archiveError = 'Alasan pengarsipan wajib diisi.';
			return;
		}

		busy = true;
		archiveError = '';
		try {
			await medical.archive(record.id, { expectedVersion: record.version!, reason });
			await invalidateAll();
			archiveOpen = false;
			location.assign('/medical-records');
		} catch (e) {
			archiveError = sessionFailure(e);
		} finally {
			busy = false;
		}
	}

	function measurement(value: number | null, unit: string) {
		return value === null || value === undefined ? '—' : `${value} ${unit}`;
	}
</script>

<svelte:head><title>{record.patientName} · Rekam Medis | InpaCare</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="text-sm text-muted-foreground">
		<a href="/medical-records" class="text-primary underline-offset-4 hover:underline">Rekam Medis</a>
		<span aria-hidden="true"> / </span><span>{record.medicalRecordNo}</span>
	</div>

	<header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold tracking-tight">Rekam Medis · {record.patientName}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{record.medicalRecordNo} · {new Date(record.recordDate + 'T12:00:00').toLocaleDateString('id-ID')}{#if record.doctorName} · {record.doctorName}{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if canEdit}
				<Button variant="destructive" disabled={busy} onclick={() => { archiveError = ''; archiveOpen = true; }}>Arsipkan rekam medis</Button>
			{/if}
			<Button href="/medical-records" variant="outline">Kembali</Button>
		</div>
	</header>

	{#if error}<Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>{/if}
	{#if notice}<Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>{/if}

	{#if data.admisiProjection}
		<Card>
			<CardHeader>
				<CardTitle role="heading" aria-level={2}>Proyeksi administrasi baca saja</CardTitle>
				<CardDescription>Informasi klinis disembunyikan untuk akun Admisi.</CardDescription>
			</CardHeader>
			<CardContent>
				<dl class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
					<div><dt class="text-sm text-muted-foreground">ID pasien</dt><dd class="mt-1 break-words">{record.patientId}</dd></div>
					<div><dt class="text-sm text-muted-foreground">Nomor rekam medis</dt><dd class="mt-1 break-words">{record.medicalRecordNo}</dd></div>
					<div><dt class="text-sm text-muted-foreground">ID dokter</dt><dd class="mt-1 break-words">{record.doctorId}</dd></div>
					<div><dt class="text-sm text-muted-foreground">Tanggal rekam medis</dt><dd class="mt-1">{new Date(record.recordDate + 'T12:00:00').toLocaleDateString('id-ID')}</dd></div>
				</dl>
			</CardContent>
		</Card>
	{:else}
		<Card>
			<CardHeader>
				<CardTitle role="heading" aria-level={2}>Catatan dokter</CardTitle>
				<CardDescription>Terakhir diperbarui {new Date(record.updatedAt ?? record.recordDate).toLocaleString('id-ID')} · versi {record.version ?? '—'}</CardDescription>
			</CardHeader>
			<CardContent>
				{#if canEdit}
					<form class="flex flex-col gap-5" onsubmit={update}>
						<Field>
							<FieldLabel for="record-date">Tanggal</FieldLabel>
							<Input id="record-date" type="date" name="recordDate" value={record.recordDate} required />
						</Field>
						<FieldGroup class="grid gap-5 lg:grid-cols-2">
							<Field><FieldLabel for="record-complaint">Keluhan</FieldLabel><Textarea id="record-complaint" name="complaint" value={record.complaint ?? ''} rows={3} required /></Field>
							<Field><FieldLabel for="record-diagnosis">Diagnosis</FieldLabel><Textarea id="record-diagnosis" name="diagnosis" value={record.diagnosis ?? ''} rows={3} required /></Field>
							<Field><FieldLabel for="record-treatment">Tindakan</FieldLabel><Textarea id="record-treatment" name="treatment" value={record.treatment ?? ''} rows={3} required /></Field>
							<Field><FieldLabel for="record-notes">Catatan medis</FieldLabel><Textarea id="record-notes" name="notes" value={record.notes ?? ''} rows={3} /></Field>
						</FieldGroup>
						<Field>
							<FieldLabel for="record-reason">Alasan koreksi</FieldLabel>
							<Input id="record-reason" name="reason" required maxlength={500} />
						</Field>
						<div><Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</Button></div>
					</form>
				{:else}
					<dl class="grid gap-x-8 gap-y-6 lg:grid-cols-2">
						<div><dt class="text-sm font-medium text-muted-foreground">Keluhan</dt><dd class="clinical-value">{record.complaint ?? '—'}</dd></div>
						<div><dt class="text-sm font-medium text-muted-foreground">Diagnosis</dt><dd class="clinical-value">{record.diagnosis ?? '—'}</dd></div>
						<div><dt class="text-sm font-medium text-muted-foreground">Tindakan</dt><dd class="clinical-value">{record.treatment ?? '—'}</dd></div>
						<div><dt class="text-sm font-medium text-muted-foreground">Catatan medis</dt><dd class="clinical-value">{record.notes || '—'}</dd></div>
					</dl>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3">
				<div class="space-y-1"><CardTitle role="heading" aria-level={2}>Observasi keperawatan</CardTitle><CardDescription>Pengukuran disimpan sebagai catatan yang dikirim perawat.</CardDescription></div>
				<Badge variant="secondary">{record.observations?.length ?? 0} observasi</Badge>
			</CardHeader>
			<CardContent>
				{#if canObserve}
					<div class="mb-6">
						<Button variant="outline" type="button" aria-expanded={observeOpen} onclick={() => observeOpen = !observeOpen}>{observeOpen ? 'Tutup formulir observasi' : 'Tambah observasi'}</Button>
						{#if observeOpen}
						<form class="mt-5 flex flex-col gap-5" onsubmit={observe}>
							<FieldGroup class="grid gap-5 lg:grid-cols-2">
								<Field><FieldLabel for="observation-symptoms">Gejala/kondisi</FieldLabel><Textarea id="observation-symptoms" name="symptoms" rows={3} required maxlength={3000} /></Field>
								<Field><FieldLabel for="observation-note">Catatan keperawatan</FieldLabel><Textarea id="observation-note" name="nursingNote" rows={3} maxlength={3000} /></Field>
							</FieldGroup>
							<FieldGroup class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								<Field><FieldLabel for="observation-temperature">Suhu (°C)</FieldLabel><Input id="observation-temperature" name="temperature" type="number" min={0} max={100} step={0.1} /></Field>
								<Field><FieldLabel for="observation-systolic">Sistolik</FieldLabel><Input id="observation-systolic" name="systolic" type="number" min={0} step={1} /></Field>
								<Field><FieldLabel for="observation-diastolic">Diastolik</FieldLabel><Input id="observation-diastolic" name="diastolic" type="number" min={0} step={1} /></Field>
								<Field><FieldLabel for="observation-pulse">Nadi (bpm)</FieldLabel><Input id="observation-pulse" name="pulse" type="number" min={0} step={1} /></Field>
								<Field><FieldLabel for="observation-respiratory">Pernapasan (/menit)</FieldLabel><Input id="observation-respiratory" name="respiratoryRate" type="number" min={0} step={1} /></Field>
								<Field><FieldLabel for="observation-spo2">Saturasi O₂ (%)</FieldLabel><Input id="observation-spo2" name="spo2" type="number" min={0} max={100} step={0.01} /></Field>
							</FieldGroup>
							<div><Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan observasi'}</Button></div>
						</form>
						{/if}
					</div>
				{/if}

				<div class="divide-y">
					{#each record.observations ?? [] as observation (observation.id)}
						<article class="py-6 first:pt-0 last:pb-0">
							<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
								<div><h3 class="font-medium">{observation.nurseName}</h3><p class="mt-1 text-sm text-muted-foreground">{new Date(observation.observedAt).toLocaleString('id-ID')} · versi {observation.version}</p></div>
								{#if canObserve && observation.nurseId === data.user.id}
									<Button variant="outline" size="sm" aria-expanded={editingObservation === observation.id} onclick={() => editingObservation = editingObservation === observation.id ? null : observation.id}>{editingObservation === observation.id ? 'Tutup koreksi' : 'Koreksi observasi'}</Button>
								{/if}
							</div>
							<p class="clinical-value mt-4"><strong>Gejala/kondisi:</strong> {observation.symptoms}</p>
							{#if observation.nursingNote}<p class="clinical-value mt-3"><strong>Catatan:</strong> {observation.nursingNote}</p>{/if}
							<dl class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								<div><dt class="text-sm text-muted-foreground">Suhu</dt><dd class="mt-1 tabular-nums">{measurement(observation.temperature, '°C')}</dd></div>
								<div><dt class="text-sm text-muted-foreground">Tekanan darah</dt><dd class="mt-1 tabular-nums">{observation.bloodPressure ?? '—'}</dd></div>
								<div><dt class="text-sm text-muted-foreground">Nadi</dt><dd class="mt-1 tabular-nums">{measurement(observation.pulse, 'bpm')}</dd></div>
								<div><dt class="text-sm text-muted-foreground">Pernapasan</dt><dd class="mt-1 tabular-nums">{measurement(observation.respiratoryRate, '/menit')}</dd></div>
								<div><dt class="text-sm text-muted-foreground">Saturasi</dt><dd class="mt-1 tabular-nums">{measurement(observation.spo2, '%')}</dd></div>
							</dl>

							{#if editingObservation === observation.id}
								<form class="mt-6 flex flex-col gap-5 rounded-lg bg-muted/40 p-4 sm:p-5" onsubmit={(event) => correctObservation(event, observation)}>
									<FieldGroup class="grid gap-5 lg:grid-cols-2">
										<Field><FieldLabel for="correction-time-{observation.id}">Waktu observasi</FieldLabel><Input id="correction-time-{observation.id}" name="observedAt" type="datetime-local" value={new Date(new Date(observation.observedAt).getTime() - new Date(observation.observedAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} required /></Field>
										<Field><FieldLabel for="correction-symptoms-{observation.id}">Gejala/kondisi</FieldLabel><Textarea id="correction-symptoms-{observation.id}" name="symptoms" value={observation.symptoms} rows={3} required /></Field>
										<Field><FieldLabel for="correction-note-{observation.id}">Catatan keperawatan</FieldLabel><Textarea id="correction-note-{observation.id}" name="nursingNote" value={observation.nursingNote ?? ''} rows={3} /></Field>
									</FieldGroup>
									<FieldGroup class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
										<Field><FieldLabel for="correction-temperature-{observation.id}">Suhu (°C)</FieldLabel><Input id="correction-temperature-{observation.id}" name="temperature" type="number" step={0.1} value={observation.temperature ?? ''} /></Field>
										<Field><FieldLabel for="correction-systolic-{observation.id}">Sistolik</FieldLabel><Input id="correction-systolic-{observation.id}" name="systolic" type="number" value={observation.systolic ?? ''} /></Field>
										<Field><FieldLabel for="correction-diastolic-{observation.id}">Diastolik</FieldLabel><Input id="correction-diastolic-{observation.id}" name="diastolic" type="number" value={observation.diastolic ?? ''} /></Field>
										<Field><FieldLabel for="correction-pulse-{observation.id}">Nadi (bpm)</FieldLabel><Input id="correction-pulse-{observation.id}" name="pulse" type="number" value={observation.pulse ?? ''} /></Field>
										<Field><FieldLabel for="correction-respiratory-{observation.id}">Pernapasan (/menit)</FieldLabel><Input id="correction-respiratory-{observation.id}" name="respiratoryRate" type="number" value={observation.respiratoryRate ?? ''} /></Field>
										<Field><FieldLabel for="correction-spo2-{observation.id}">Saturasi O₂ (%)</FieldLabel><Input id="correction-spo2-{observation.id}" name="spo2" type="number" step={0.01} value={observation.spo2 ?? ''} /></Field>
									</FieldGroup>
									<Field><FieldLabel for="correction-reason-{observation.id}">Alasan koreksi</FieldLabel><Input id="correction-reason-{observation.id}" name="reason" required maxlength={500} /></Field>
									<div class="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan koreksi'}</Button><Button variant="outline" type="button" onclick={() => editingObservation = null}>Batal</Button></div>
								</form>
							{/if}
						</article>
					{:else}
						<p class="py-8 text-center text-sm text-muted-foreground">Belum ada observasi keperawatan.</p>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}
</div>

<Dialog bind:open={archiveOpen}>
	<DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" showCloseButton={!busy} onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
		<DialogHeader>
			<DialogTitle>Arsipkan rekam medis?</DialogTitle>
			<DialogDescription>Catatan {record.medicalRecordNo} akan diarsipkan. Tindakan ini memerlukan alasan dan konfirmasi.</DialogDescription>
		</DialogHeader>
		<form class="flex flex-col gap-5" onsubmit={archive}>
			<Field>
				<FieldLabel for="archive-reason">Alasan pengarsipan</FieldLabel>
				<Textarea id="archive-reason" name="reason" bind:value={archiveReason} rows={3} maxlength={500} required aria-invalid={archiveError ? 'true' : undefined} />
			</Field>
			{#if archiveError}<Alert variant="destructive" role="alert"><AlertDescription>{archiveError}</AlertDescription></Alert>{/if}
			<DialogFooter>
				<Button type="button" variant="outline" disabled={busy} onclick={() => archiveOpen = false}>Batal</Button>
				<Button type="submit" variant="destructive" disabled={busy}>{busy ? 'Mengarsipkan…' : 'Konfirmasi arsip'}</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>

<style>
	.clinical-value { max-width: 72ch; margin-top: 0.5rem; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.75; }
</style>
