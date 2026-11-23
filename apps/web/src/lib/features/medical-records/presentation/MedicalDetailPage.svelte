<script lang="ts">
import { Archive, ArrowLeft, Pencil, Plus, Save, X } from 'lucide-svelte';
	import { toast } from '$lib/shared/ui/sonner/index.js';
	import { goto, invalidateAll } from '$app/navigation';
	import ObservationFields from './ObservationFields.svelte';
	import ObservationList from './ObservationList.svelte';
	import { readObservationForm } from './observation-form';
	import type { MedicalRecords, MedicalDetailData, Observation } from '$lib/features/medical-records';
	import { sessionFailure } from '$lib/shared/presentation/session';
	import { formText } from '$lib/shared/presentation/form';
	import { Badge } from '$lib/shared/ui/badge/index.js';
	import { Button } from '$lib/shared/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
	import Modal from '$lib/shared/ui/dialog-frame.svelte';
	import { Field, FieldGroup, FieldLabel } from '$lib/shared/ui/field/index.js';
	import FormDatePicker from '$lib/shared/ui/form-date-picker.svelte';
	import { Input } from '$lib/shared/ui/input/index.js';
	import { Textarea } from '$lib/shared/ui/textarea/index.js';

	let { data, medical }: { data: MedicalDetailData; medical: MedicalRecords } = $props();
	let busy = $state(false);
	let editingObservation = $state<string | null>(null);
	let observeOpen = $state(false);
	let recordEditOpen = $state(false);
	let archiveOpen = $state(false);
	let archiveReason = $state('');
	const record = $derived(data.record);
	const correcting = $derived(record.observations?.find(item => item.id === editingObservation));

	const canEdit = $derived(data.user.role === 'DOKTER' && data.user.id === record.doctorId);
	const canObserve = $derived(!data.admisiProjection && data.record.canRecordObservations);

	async function send(operation: () => Promise<unknown>) {
		if (busy) return false;
		busy = true;
		const toastId = toast.loading('Menyimpan perubahan…');
		try {
			await operation();
			const refreshed = await invalidateAll().then(() => true, () => false);
            editingObservation = null;
			observeOpen = false;
			recordEditOpen = false;
			if (refreshed) toast.success('Perubahan tersimpan.', { id: toastId });
            else toast.warning('Perubahan rekam medis tersimpan. Muat ulang halaman untuk melihat detail terbaru.', { id: toastId });
		} catch (e) {
			toast.error(sessionFailure(e, 'save', 'rekam medis'), { id: toastId });
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
		await send(() => medical.observe(record.id, readObservationForm(f)));
	}

	async function correctObservation(event: SubmitEvent, observation: Observation) {
		event.preventDefault();
		const f = new FormData(event.currentTarget as HTMLFormElement);
		await send(() => medical.correctObservation(record.id, observation.id, {
			...readObservationForm(f),
			expectedVersion: observation.version,
			reason: formText(f, 'reason')
		}));
	}

	async function removeRecord(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const reason = archiveReason.trim();
		if (!reason) {
			toast.error('Isi Alasan pengarsipan rekam medis.');
			return;
		}

		busy = true;
		try {
			await medical.archive(record.id, { expectedVersion: record.version!, reason });
			archiveOpen = false;
			await goto('/medical-records', { invalidateAll: true }).then(
                () => toast.success('Rekam medis berhasil diarsipkan.'),
                () => toast.warning('Rekam medis sudah diarsipkan. Buka kembali daftar rekam medis.')
            );
		} catch (e) {
			toast.error(sessionFailure(e, 'save', 'pengarsipan rekam medis'));
		} finally {
			busy = false;
		}
	}

</script>

<svelte:head><title>{record.patientName} · Rekam medis | InpaCare</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="text-sm text-muted-foreground">
		<a href="/medical-records" class="text-primary underline-offset-4 hover:underline">Rekam medis</a>
		<span aria-hidden="true"> / </span><span>{record.medicalRecordNo}</span>
	</div>

	<header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold tracking-tight">Rekam medis · {record.patientName}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{record.medicalRecordNo} · {new Date(record.recordDate + 'T12:00:00').toLocaleDateString('id-ID')}{#if record.doctorName} · {record.doctorName}{/if}
			</p>
		</div>
		<div class="action-buttons">
			{#if canEdit}
				<Button variant="outline" disabled={busy} onclick={() => recordEditOpen = true}><Pencil aria-hidden="true" /> Ubah catatan dokter</Button>
				<Button variant="destructive" disabled={busy} onclick={() => { archiveOpen = true; }}><Archive aria-hidden="true" /> Arsipkan rekam medis</Button>
			{/if}
			<Button href="/medical-records" variant="outline"><ArrowLeft aria-hidden="true" /> Kembali</Button>
		</div>
	</header>

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

					<dl class="grid gap-x-8 gap-y-6 lg:grid-cols-2">
						<div><dt class="text-sm font-medium text-muted-foreground">Keluhan</dt><dd class="clinical-value">{record.complaint ?? '—'}</dd></div>
						<div><dt class="text-sm font-medium text-muted-foreground">Diagnosis</dt><dd class="clinical-value">{record.diagnosis ?? '—'}</dd></div>
						<div><dt class="text-sm font-medium text-muted-foreground">Tindakan</dt><dd class="clinical-value">{record.treatment ?? '—'}</dd></div>
						<div><dt class="text-sm font-medium text-muted-foreground">Catatan medis</dt><dd class="clinical-value">{record.notes || '—'}</dd></div>
					</dl>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3">
				<div class="space-y-1"><CardTitle role="heading" aria-level={2}>Observasi keperawatan</CardTitle><CardDescription>Pengukuran disimpan sebagai catatan yang dikirim perawat.</CardDescription></div>
				<Badge variant="secondary">{record.observations?.length ?? 0} observasi</Badge>
			</CardHeader>
			<CardContent>
				{#if canObserve}
					<Button variant="outline" aria-haspopup="dialog" onclick={() => observeOpen = true}><Plus aria-hidden="true" /> Tambah observasi</Button>
				{/if}

				<div class="mt-4">
					<ObservationList observations={record.observations ?? []}
						correctAs={data.user.role === 'PERAWAT' && (canObserve || data.record.cycleId === null) ? data.user.id : undefined}
						onCorrect={(id) => editingObservation = id} />
				</div>
			</CardContent>
		</Card>
	{/if}
</div>

{#if recordEditOpen || observeOpen || correcting || archiveOpen}
<Modal title={recordEditOpen ? 'Ubah catatan dokter' : observeOpen ? 'Tambah observasi' : correcting ? 'Koreksi observasi' : 'Arsipkan rekam medis?'}
    description={archiveOpen ? 'Masukkan alasan pengarsipan rekam medis.' : `${record.patientName} · ${record.medicalRecordNo}`}
    {busy} protectChanges wide={!archiveOpen} formKey={recordEditOpen ? 'record' : observeOpen ? 'observe' : correcting?.id ?? 'archive'}
    onclose={() => { recordEditOpen = false; observeOpen = false; editingObservation = null; archiveOpen = false; }}>
    {#snippet children(close)}
    {#if recordEditOpen}<form class="flex flex-col gap-5" onsubmit={update}>
						<Field>
							<FieldLabel for="record-date">Tanggal</FieldLabel>
							<FormDatePicker id="record-date" type="date" name="recordDate" value={record.recordDate} required />
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
						<div class="form-actions"><Button variant="outline" onclick={close} disabled={busy}><X aria-hidden="true" /> Batal</Button><Button type="submit" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan perubahan'}</Button></div>
					</form>
    {:else if observeOpen}<form class="flex flex-col gap-5" onsubmit={observe}>
							<ObservationFields />
							<div class="form-actions"><Button variant="outline" onclick={close} disabled={busy}><X aria-hidden="true" /> Batal</Button><Button type="submit" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan observasi'}</Button></div>
						</form>
    {:else if correcting}{@const observation = correcting}<form class="flex flex-col gap-5" onsubmit={(event) => correctObservation(event, observation)}>
									<ObservationFields {observation} />
									<Field><FieldLabel for="correction-reason-{observation.id}">Alasan koreksi</FieldLabel><Input id="correction-reason-{observation.id}" name="reason" required maxlength={500} /></Field>
									<div class="form-actions"><Button type="submit" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan koreksi'}</Button><Button variant="outline" type="button" onclick={close}><X aria-hidden="true" /> Batal</Button></div>
								</form>
    {:else if archiveOpen}<form class="flex flex-col gap-5" onsubmit={removeRecord}>
			<Field>
				<FieldLabel for="archive-reason">Alasan pengarsipan</FieldLabel>
				<Textarea id="archive-reason" name="reason" bind:value={archiveReason} rows={3} maxlength={500} required />
			</Field>
			<div class="form-actions">
				<Button type="button" variant="outline" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
				<Button type="submit" variant="destructive" disabled={busy}><Archive aria-hidden="true" /> {busy ? 'Mengarsipkan…' : 'Konfirmasi arsip'}</Button>
			</div>
		</form>
    {/if}
    {/snippet}
</Modal>
{/if}

<style>
	.clinical-value { max-width: 72ch; margin-top: 0.5rem; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.75; }
</style>
