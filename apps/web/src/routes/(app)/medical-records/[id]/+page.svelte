<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import Modal from '$lib/components/Modal.svelte';

  let { data } = $props();
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let confirmDeleteOpen = $state(false);
  let observeOpen = $state(false);

  let record = $derived(data.record);
  const canEdit = $derived(data.user.role === 'DOKTER' && data.user.id === record.doctorId);
  const canObserve = $derived(data.user.role === 'PERAWAT');
  const doctorLabel = $derived(
    /^dr\.?\s/i.test(record.doctorName) ? record.doctorName : `dr. ${record.doctorName}`
  );

  async function send(path: string, payload: object, successMessage: string): Promise<boolean> {
    busy = true;
    error = '';
    notice = '';
    try {
      await api(path, {
        method: path.endsWith('/observations') ? 'POST' : 'PATCH',
        body: JSON.stringify(payload)
      });
      await invalidateAll();
      notice = successMessage;
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Perubahan gagal disimpan.';
      return false;
    } finally {
      busy = false;
    }
  }

  async function update(event: SubmitEvent) {
    event.preventDefault();
    const f = new FormData(event.currentTarget as HTMLFormElement);
    await send(
      `/medical-records/${record.id}`,
      {
        expectedVersion: record.version,
        complaint: f.get('complaint'),
        diagnosis: f.get('diagnosis'),
        treatment: f.get('treatment'),
        notes: f.get('notes'),
        recordDate: f.get('recordDate')
      },
      'Perubahan rekam medis tersimpan.'
    );
  }

  async function removeRecord() {
    busy = true;
    error = '';
    notice = '';
    try {
      await api(`/medical-records/${record.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedVersion: record.version })
      });
      confirmDeleteOpen = false;
      await goto('/medical-records', { invalidateAll: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Rekam medis gagal dihapus.';
      confirmDeleteOpen = false;
    } finally {
      busy = false;
    }
  }

  async function observe(event: SubmitEvent) {
    event.preventDefault();
    const formEl = event.currentTarget as HTMLFormElement;
    const f = new FormData(formEl);
    const decimal = (key: string) => {
      const value = String(f.get(key) ?? '').trim();
      return value === '' ? null : Number(value);
    };
    const integer = (key: string, label: string) => {
      const value = String(f.get(key) ?? '').trim();
      if (value === '') return null;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${label} harus berupa bilangan bulat nonnegatif.`);
      }
      return parsed;
    };
    let systolic: number | null;
    let diastolic: number | null;
    let pulse: number | null;
    let respiratoryRate: number | null;
    try {
      systolic = integer('systolic', 'Tekanan sistolik');
      diastolic = integer('diastolic', 'Tekanan diastolik');
      pulse = integer('pulse', 'Denyut nadi');
      respiratoryRate = integer('respiratoryRate', 'Laju pernapasan');
      if ((systolic === null) !== (diastolic === null)) {
        throw new Error('Tekanan darah harus diisi lengkap (sistolik dan diastolik).');
      }
    } catch (validationError) {
      error = (validationError as Error).message;
      notice = '';
      return;
    }
    const ok = await send(
      `/medical-records/${record.id}/observations`,
      {
        symptoms: f.get('symptoms'),
        nursingNote: f.get('nursingNote'),
        observedAt: new Date().toISOString(),
        temperature: decimal('temperature'),
        systolic,
        diastolic,
        pulse,
        respiratoryRate,
        spo2: decimal('spo2')
      },
      'Observasi keperawatan tersimpan.'
    );
    if (ok) {
      formEl.reset();
      observeOpen = false;
    }
  }

  function measurement(value: number | null, unit: string) {
    return value === null || value === undefined ? '—' : `${value} ${unit}`;
  }
</script>

<svelte:head><title>{record.patientName} · Rekam Medis | InpaCare</title></svelte:head>
<div class="crumb">
  <a href="/medical-records" class="text-link">Rekam Medis</a><span> / {record.medicalRecordNo}</span>
</div>
<section class="page-heading">
  <div>
    <h1 class="page-title">Rekam Medis · {record.patientName}</h1>
    <p class="page-subtitle">
      {record.medicalRecordNo} · {new Date(record.recordDate + 'T12:00:00').toLocaleDateString('id-ID')} · {doctorLabel}
    </p>
  </div>
  <div class="heading-actions">
    {#if canEdit}
      <button
        type="button"
        class="button danger"
        disabled={busy}
        onclick={() => { confirmDeleteOpen = true; error = ''; }}
      >
        Hapus rekam medis
      </button>
    {/if}
    <a href="/medical-records" class="button secondary">Kembali</a>
  </div>
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if notice}<p class="success" role="status">{notice}</p>{/if}

<section id="catatan-dokter" class="panel record-panel">
  <div class="panel-header">
    <div>
      <h2>Catatan dokter</h2>
      <p class="muted">
        Terakhir diperbarui {new Date(record.updatedAt).toLocaleString('id-ID')} · versi {record.version}
      </p>
    </div>
  </div>
  {#if canEdit}
    {#key record.version}
      <form class="form-grid" onsubmit={update}>
        <label class="field">
          Tanggal
          <input type="date" name="recordDate" value={record.recordDate} required />
        </label>
        <label class="field">
          Keluhan
          <textarea name="complaint" rows="3" maxlength="5000" required>{record.complaint}</textarea>
        </label>
        <label class="field">
          Diagnosis
          <textarea name="diagnosis" rows="3" maxlength="5000" required>{record.diagnosis}</textarea>
        </label>
        <label class="field">
          Tindakan
          <textarea name="treatment" rows="3" maxlength="5000" required>{record.treatment}</textarea>
        </label>
        <label class="field full">
          Catatan medis
          <textarea name="notes" rows="3" maxlength="5000">{record.notes}</textarea>
        </label>
        <div class="form-actions full">
          <button class="button primary" disabled={busy}>Simpan perubahan</button>
        </div>
      </form>
    {/key}
  {:else}
    <dl class="clinical-grid">
      <div><dt>Keluhan</dt><dd>{record.complaint}</dd></div>
      <div><dt>Diagnosis</dt><dd>{record.diagnosis}</dd></div>
      <div><dt>Tindakan</dt><dd>{record.treatment}</dd></div>
      <div><dt>Catatan medis</dt><dd>{record.notes || '—'}</dd></div>
    </dl>
  {/if}
</section>

<section class="panel">
  <div class="panel-header">
    <div>
      <h2>Observasi keperawatan</h2>
      <p class="muted">Pengukuran disimpan sebagai catatan kondisi dan tanda vital oleh perawat.</p>
    </div>
    <span class="badge">{record.observations.length} observasi</span>
  </div>
  {#if canObserve}
    <details class="observe-form" bind:open={observeOpen}>
      <summary class="button secondary small">＋ Tambah observasi</summary>
      <form class="form-grid" onsubmit={observe}>
        <label class="field">
          Gejala/kondisi
          <textarea name="symptoms" rows="2" required maxlength="3000"></textarea>
        </label>
        <label class="field">
          Catatan keperawatan
          <textarea name="nursingNote" rows="2" maxlength="3000"></textarea>
        </label>
        <div class="vitals-grid full">
          <label class="field">Suhu (°C)<input name="temperature" type="number" min="0" max="100" step="0.1" /></label>
          <label class="field">Sistolik<input name="systolic" type="number" min="0" step="1" /></label>
          <label class="field">Diastolik<input name="diastolic" type="number" min="0" step="1" /></label>
          <label class="field">Nadi (bpm)<input name="pulse" type="number" min="0" step="1" /></label>
          <label class="field">Pernapasan (/menit)<input name="respiratoryRate" type="number" min="0" step="1" /></label>
          <label class="field">Saturasi O₂ (%)<input name="spo2" type="number" min="0" max="100" step="0.01" /></label>
        </div>
        <div class="form-actions full">
          <button class="button primary" disabled={busy}>Simpan observasi</button>
        </div>
      </form>
    </details>
  {/if}
  <div class="observations">
    {#each record.observations as observation (observation.id)}
      <article class="observation">
        <div class="observation-heading">
          <div>
            <strong>{observation.nurseName}</strong>
            <span class="muted"> · {new Date(observation.observedAt).toLocaleString('id-ID')}</span>
          </div>
        </div>
        <p><strong>Gejala/kondisi:</strong> {observation.symptoms}</p>
        {#if observation.nursingNote}<p><strong>Catatan:</strong> {observation.nursingNote}</p>{/if}
        <dl class="vitals-grid values">
          <div><dt>Suhu</dt><dd>{measurement(observation.temperature, '°C')}</dd></div>
          <div><dt>Tekanan darah</dt><dd>{observation.bloodPressure ?? '—'}</dd></div>
          <div><dt>Nadi</dt><dd>{measurement(observation.pulse, 'bpm')}</dd></div>
          <div><dt>Pernapasan</dt><dd>{measurement(observation.respiratoryRate, '/menit')}</dd></div>
          <div><dt>Saturasi</dt><dd>{measurement(observation.spo2, '%')}</dd></div>
        </dl>
      </article>
    {:else}
      <p class="empty">Belum ada observasi keperawatan.</p>
    {/each}
  </div>
</section>

{#if confirmDeleteOpen}
  <Modal title="Konfirmasi hapus rekam medis" onclose={() => (confirmDeleteOpen = false)}>
    <p>
      Apakah Anda yakin ingin menghapus rekam medis <strong>{record.patientName}</strong>
      ({record.medicalRecordNo})?
    </p>
    <p class="muted confirm-note">
      Rekam medis akan dihapus secara logis dari daftar aktif sementara catatan observasi keperawatan tetap tersimpan.
    </p>
    <div class="form-actions">
      <button
        type="button"
        class="button secondary"
        disabled={busy}
        onclick={() => (confirmDeleteOpen = false)}
      >
        Batal
      </button>
      <button type="button" class="button danger" disabled={busy} onclick={removeRecord}>
        {busy ? 'Menghapus…' : 'Hapus rekam medis'}
      </button>
    </div>
  </Modal>
{/if}

<style>
  .crumb {
    font-size: 12px;
    color: #747b8c;
    margin: 0 0 14px;
  }
  .heading-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .record-panel {
    margin-bottom: 14px;
  }
  .clinical-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(200px, 1fr));
    gap: 16px;
    margin: 18px 0;
  }
  .clinical-grid div {
    padding: 12px;
    background: #f8f9fb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .clinical-grid dt,
  .values dt {
    color: #737a8a;
    font-size: 11px;
  }
  .clinical-grid dd,
  .values dd {
    margin: 5px 0 0;
    font-size: 14px;
    white-space: pre-wrap;
  }
  .observe-form {
    margin: 12px 0;
  }
  .observe-form summary {
    display: inline-block;
    cursor: pointer;
  }
  .observe-form[open] summary {
    margin-bottom: 14px;
  }
  .vitals-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(100px, 1fr));
    gap: 10px;
  }
  .values {
    margin: 10px 0;
  }
  .observation {
    border-top: 1px solid #e5e7eb;
    padding: 14px 0;
  }
  .observation p {
    font-size: 13px;
    margin: 7px 0;
  }
  .observation-heading {
    display: flex;
    justify-content: space-between;
  }
  .values div {
    padding: 8px;
    background: #f8f9fb;
    border-radius: 6px;
  }
  .confirm-note {
    margin-top: 10px;
    font-size: 12px;
  }
  @media (max-width: 650px) {
    .clinical-grid {
      grid-template-columns: 1fr;
    }
    .vitals-grid {
      grid-template-columns: repeat(2, minmax(110px, 1fr));
    }
  }
</style>
