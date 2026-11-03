<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import Modal from '$lib/components/Modal.svelte';

  let { data } = $props();
  let search = $state('');
  let creating = $state(false);
  let patientMode = $state<'existing' | 'new'>('existing');
  let selectedPatientId = $state('');
  let newPatientBpjs = $state(false);
  let deleting = $state<any>(null);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  const doctors = $derived(data.user.role === 'DOKTER');
  const filtered = $derived(
    data.records.filter(
      (r: any) =>
        !search ||
        `${r.patientName} ${r.medicalRecordNo} ${r.diagnosis} ${r.doctorName}`
          .toLowerCase()
          .includes(search.toLowerCase())
    )
  );

  function resetCreateState() {
    creating = false;
    patientMode = 'existing';
    selectedPatientId = '';
    newPatientBpjs = false;
    error = '';
  }

  function handlePatientSelect(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === '__new__') {
      selectedPatientId = '';
      patientMode = 'new';
    } else {
      selectedPatientId = value;
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    const f = new FormData(event.currentTarget as HTMLFormElement);
    busy = true;
    error = '';
    notice = '';
    try {
      const payload: Record<string, unknown> = {
        complaint: f.get('complaint'),
        diagnosis: f.get('diagnosis'),
        treatment: f.get('treatment'),
        notes: f.get('notes'),
        recordDate: f.get('recordDate')
      };
      if (patientMode === 'new') {
        const mrn = String(f.get('medicalRecordNo') ?? '').trim();
        const bpjsNo = String(f.get('bpjsNumber') ?? '').trim();
        payload.newPatient = {
          name: String(f.get('patientName') ?? '').trim(),
          medicalRecordNo: mrn || null,
          birthDate: f.get('birthDate'),
          gender: f.get('gender'),
          bpjs: newPatientBpjs,
          bpjsNumber: newPatientBpjs && bpjsNo ? bpjsNo : null
        };
      } else {
        payload.patientId = f.get('patientId');
      }
      const row = await api<{ id: string }>('/medical-records', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      resetCreateState();
      await goto(`/medical-records/${row.id}`, { invalidateAll: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Rekam medis gagal disimpan.';
    } finally {
      busy = false;
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    busy = true;
    error = '';
    notice = '';
    try {
      await api(`/medical-records/${deleting.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedVersion: deleting.version })
      });
      deleting = null;
      await invalidateAll();
      notice = 'Rekam medis berhasil dihapus.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Rekam medis gagal dihapus.';
      deleting = null;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Rekam Medis | InpaCare</title></svelte:head>
<section class="page-heading">
  <div>
    <h1 class="page-title">Daftar Rekam Medis</h1>
    <p class="page-subtitle">Catatan dokter dan observasi keperawatan pasien rawat inap.</p>
  </div>
  {#if doctors}
    <button
      class="button primary"
      onclick={() => {
        if (creating) {
          resetCreateState();
        } else {
          creating = true;
          error = '';
        }
      }}
    >
      ＋ Tambah rekam medis
    </button>
  {/if}
</section>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if notice}<p class="success" role="status">{notice}</p>{/if}

<section class="stats">
  <div class="stat">
    <strong>{data.total ?? data.records.length}</strong>
    <span>Catatan dalam cakupan Anda</span>
  </div>
  <div class="stat">
    <strong>{data.records.filter((r: any) => r.recordDate === today).length}</strong>
    <span>Rekam medis hari ini</span>
  </div>
  <div class="stat">
    <strong>{data.records.reduce((n: number, r: any) => n + Number(r.observationCount), 0)}</strong>
    <span>Observasi tersimpan</span>
  </div>
</section>

{#if creating && doctors}
  <section class="panel form-panel">
    <div class="panel-header">
      <div>
        <h2>Tambah rekam medis</h2>
        <p class="muted">Pilih pasien yang sudah ditangani atau daftarkan pasien baru sekaligus mencatat rekam medis.</p>
      </div>
      <div class="mode-switch" role="group" aria-label="Sumber data pasien">
        <button
          type="button"
          class="button small"
          class:primary={patientMode === 'existing'}
          class:secondary={patientMode !== 'existing'}
          onclick={() => { patientMode = 'existing'; error = ''; }}
        >
          Pasien terdaftar
        </button>
        <button
          type="button"
          class="button small"
          class:primary={patientMode === 'new'}
          class:secondary={patientMode !== 'new'}
          onclick={() => { patientMode = 'new'; selectedPatientId = ''; error = ''; }}
        >
          ＋ Pasien baru
        </button>
      </div>
    </div>

    <form class="form-grid" onsubmit={create}>
      {#if patientMode === 'existing'}
        <label class="field">
          Pasien
          <select name="patientId" value={selectedPatientId} onchange={handlePatientSelect} required>
            <option value="">Pilih pasien yang ditangani</option>
            <option value="__new__">＋ Tambah pasien baru…</option>
            {#each data.reference.patients as patient}
              <option value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>
            {/each}
          </select>
        </label>
      {:else}
        <fieldset class="new-patient-box full">
          <legend>Data pasien baru</legend>
          <div class="form-grid">
            <label class="field">
              Nama pasien baru
              <input
                name="patientName"
                placeholder="Masukkan nama lengkap pasien"
                maxlength="120"
                required
              />
            </label>
            <label class="field">
              Nomor RM (opsional)
              <input
                name="medicalRecordNo"
                placeholder="Kosongkan untuk nomor RM otomatis (mis. RM-04230)"
                maxlength="40"
              />
            </label>
            <label class="field">
              Tanggal lahir
              <input type="date" name="birthDate" max={today} required />
            </label>
            <label class="field">
              Jenis kelamin
              <select name="gender" required>
                <option value="">Pilih jenis kelamin</option>
                <option value="P">Perempuan</option>
                <option value="L">Laki-laki</option>
              </select>
            </label>
            <div class="field bpjs-row">
              <label class="checkbox-label">
                <input type="checkbox" name="bpjs" bind:checked={newPatientBpjs} />
                <span>Peserta BPJS Kesehatan</span>
              </label>
            </div>
            {#if newPatientBpjs}
              <label class="field">
                Nomor BPJS
                <input
                  name="bpjsNumber"
                  placeholder="Masukkan nomor kartu BPJS"
                  maxlength="30"
                />
              </label>
            {/if}
          </div>
        </fieldset>
      {/if}

      <label class="field" class:full={patientMode === 'new'}>
        Tanggal rekam medis
        <input type="date" name="recordDate" value={today} required />
      </label>
      <label class="field">
        Keluhan
        <textarea name="complaint" rows="2" required maxlength="5000"></textarea>
      </label>
      <label class="field">
        Diagnosis
        <textarea name="diagnosis" rows="2" required maxlength="5000"></textarea>
      </label>
      <label class="field">
        Tindakan
        <textarea name="treatment" rows="2" required maxlength="5000"></textarea>
      </label>
      <label class="field">
        Catatan medis
        <textarea name="notes" rows="2" maxlength="5000"></textarea>
      </label>
      <div class="form-actions full">
        <button class="button primary" disabled={busy}>Simpan rekam medis</button>
        <button class="button secondary" type="button" onclick={resetCreateState}>Batal</button>
      </div>
    </form>
  </section>
{/if}

<section class="panel">
  <div class="filters">
    <label class="field search-field">
      Cari pasien atau rekam medis
      <input bind:value={search} placeholder="Nama pasien, nomor RM, diagnosis" />
    </label>
    <span class="muted">Menampilkan {filtered.length} dari {data.total ?? data.records.length}</span>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>No. RM / pasien</th>
          <th>Diagnosis</th>
          <th>Tanggal</th>
          <th>Dokter</th>
          <th>Observasi</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as record (record.id)}
          <tr>
            <td>
              <strong>{record.patientName}</strong>
              <span class="cell-meta">{record.medicalRecordNo}</span>
            </td>
            <td>{record.diagnosis}</td>
            <td>{new Date(record.recordDate + 'T12:00:00').toLocaleDateString('id-ID')}</td>
            <td>{record.doctorName}</td>
            <td>{record.observationCount}</td>
            <td>
              <div class="row-actions">
                <a class="text-link" href={'/medical-records/' + record.id}>
                  {doctors && record.doctorId === data.user.id ? 'Lihat' : 'Lihat detail →'}
                </a>
                {#if doctors && record.doctorId === data.user.id}
                  <a class="text-link" href={'/medical-records/' + record.id + '#catatan-dokter'}>Ubah</a>
                  <button
                    type="button"
                    class="text-link danger-link"
                    disabled={busy}
                    onclick={() => { deleting = record; error = ''; }}
                  >
                    Hapus
                  </button>
                {/if}
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" class="empty">Tidak ada rekam medis dalam cakupan Anda.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

{#if deleting}
  <Modal title="Konfirmasi hapus rekam medis" onclose={() => (deleting = null)}>
    <p>
      Apakah Anda yakin ingin menghapus rekam medis <strong>{deleting.patientName}</strong>
      ({deleting.medicalRecordNo}) tertanggal
      {new Date(deleting.recordDate + 'T12:00:00').toLocaleDateString('id-ID')}?
    </p>
    <p class="muted confirm-note">
      Penghapusan dilakukan secara logis sehingga riwayat observasi tetap tersimpan di basis data namun tidak lagi ditampilkan pada daftar aktif.
    </p>
    <div class="form-actions">
      <button type="button" class="button secondary" disabled={busy} onclick={() => (deleting = null)}>
        Batal
      </button>
      <button type="button" class="button danger" disabled={busy} onclick={confirmDelete}>
        {busy ? 'Menghapus…' : 'Hapus rekam medis'}
      </button>
    </div>
  </Modal>
{/if}

<style>
  .mode-switch {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .new-patient-box {
    margin: 0;
    padding: 16px;
    border: 1px solid #dde2f5;
    border-radius: 10px;
    background: #f8f9fe;
  }
  .new-patient-box legend {
    padding: 0 8px;
    font-size: 12px;
    font-weight: 650;
    color: #3f4db8;
  }
  .bpjs-row {
    justify-content: center;
  }
  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
    min-height: 42px;
  }
  .cell-meta {
    display: block;
    font-size: 11px;
    color: #747b8c;
    margin-top: 3px;
  }
  .row-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .danger-link {
    background: none;
    border: 0;
    padding: 0;
    color: #b42318;
  }
  .danger-link:hover {
    text-decoration: underline;
  }
  .confirm-note {
    margin-top: 10px;
    font-size: 12px;
  }
</style>
