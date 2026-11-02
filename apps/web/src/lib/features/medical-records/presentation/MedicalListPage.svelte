<script lang="ts">
import { invalidateAll } from '$app/navigation';
import type { MedicalRecords, MedicalListData } from '$lib/features/medical-records';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { Plus, ArrowRight } from 'lucide-svelte';
let { data, medical }: {
    data: MedicalListData;
    medical: MedicalRecords;
} = $props();
let search = $state('');
let creating = $state(false);
let busy = $state(false);
let error = $state('');
let notice = $state('');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const doctors = $derived(data.user.role === 'DOKTER');
const admisi = $derived(data.admisiProjection);
const filtered = $derived(data.records.filter((r) => !search || `${r.patientName} ${r.medicalRecordNo} ${r.diagnosis ?? ''}`.toLowerCase().includes(search.toLowerCase())));
async function create(event: SubmitEvent) { event.preventDefault(); const f = new FormData(event.currentTarget as HTMLFormElement); busy = true; error = ''; try {
    const row = await medical.create({ patientId: formText(f, 'patientId'), complaint: formText(f, 'complaint'), diagnosis: formText(f, 'diagnosis'), treatment: formText(f, 'treatment'), notes: formText(f, 'notes'), recordDate: formText(f, 'recordDate') });
    await invalidateAll();
    creating = false;
    notice = 'Rekam medis tersimpan.';
    location.href = `/medical-records/${row.id}`;
}
catch (e) {
    error = sessionFailure(e);
}
finally {
    busy = false;
} }
</script>

<svelte:head><title>Rekam Medis | InpaCare</title></svelte:head>
<section class="page-heading"><div><h1 class="page-title">Daftar Rekam Medis</h1><p class="page-subtitle">{admisi?'Proyeksi administrasi baca saja: identitas catatan dan tanggal.':'Catatan dokter dan observasi keperawatan pasien rawat inap.'}</p></div>{#if doctors}<button class="button primary" aria-expanded={creating} onclick={()=>{creating=!creating;error='';}}><Plus size={16} aria-hidden="true"/> Tambah rekam medis</button>{/if}</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="success" role="status">{notice}</p>{/if}
<section class="stats"><div class="stat"><strong>{data.records.length}</strong><span>{admisi?'Catatan administratif tersedia':'Catatan dalam cakupan Anda'}</span></div>{#if !admisi}<div class="stat"><strong>{data.records.filter((r)=>r.recordDate===today).length}</strong><span>Rekam medis hari ini</span></div><div class="stat"><strong>{data.records.reduce((n:number,r)=>n+Number(r.observationCount),0)}</strong><span>Observasi tersimpan</span></div>{/if}</section>
{#if creating&&doctors}<section class="panel form-panel"><h2>Tambah rekam medis</h2><form class="form-grid" onsubmit={create}><label class="field">Pasien<select name="patientId" required><option value="">Pilih pasien yang ditangani</option>{#each data.reference.patients as patient}<option value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>{/each}</select></label><label class="field">Tanggal rekam medis<input type="date" name="recordDate" value={today} required /></label><label class="field">Keluhan<textarea name="complaint" rows="2" required maxlength="5000"></textarea></label><label class="field">Diagnosis<textarea name="diagnosis" rows="2" required maxlength="5000"></textarea></label><label class="field">Tindakan<textarea name="treatment" rows="2" required maxlength="5000"></textarea></label><label class="field">Catatan medis<textarea name="notes" rows="2" maxlength="5000"></textarea></label><div class="form-actions"><button class="button primary" disabled={busy}>Simpan rekam medis</button><button class="button secondary" type="button" onclick={()=>creating=false}>Batal</button></div></form></section>{/if}
<section class="panel"><div class="filters"><label class="field search-field">Cari pasien atau rekam medis<input type="search" bind:value={search} placeholder="Nama pasien, nomor RM, diagnosis" /></label><span class="muted">Menampilkan {filtered.length} dari {data.records.length}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>No. RM / pasien</th>{#if !admisi}<th>Diagnosis</th>{/if}<th>Tanggal</th>{#if !admisi}<th>Dokter</th><th>Observasi</th>{/if}<th>Aksi</th></tr></thead><tbody>{#each filtered as record (record.id)}<tr><td><strong>{record.patientName}</strong><span class="cell-meta">{record.medicalRecordNo}</span></td>{#if !admisi}<td>{record.diagnosis}</td>{/if}<td>{new Date(record.recordDate+'T12:00:00').toLocaleDateString('id-ID')}</td>{#if !admisi}<td>{record.doctorName}</td><td>{record.observationCount}</td>{/if}<td><a class="text-link record-link" href={'/medical-records/'+record.id}>Lihat detail <ArrowRight size={14} aria-hidden="true"/></a></td></tr>{:else}<tr><td colspan={admisi?3:6} class="empty">Tidak ada rekam medis dalam cakupan Anda.</td></tr>{/each}</tbody></table></div></section>

<style>
	.form-panel h2{margin-bottom:20px}
	.search-field{max-width:560px}
	.filters>span{font-size:13px;padding-bottom:12px}
	.cell-meta{display:block;font-size:12px;color:var(--muted);margin-top:4px}
	.record-link{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
</style>
