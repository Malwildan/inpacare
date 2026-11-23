<script lang="ts">
import { goto } from '$app/navigation';
import { tick } from 'svelte';
import { Plus } from 'lucide-svelte';
import type { PatientListData, Patients } from '$lib/features/patients';
import { formText } from '$lib/shared/presentation/form';
import { isUnconfirmedSave, sessionFailure } from '$lib/shared/presentation/session';
import { date } from '$lib/shared/format';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
import { Checkbox } from '$lib/shared/ui/checkbox/index.js';
import { Field, FieldLabel } from '$lib/shared/ui/field/index.js';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import FormDatePicker from '$lib/shared/ui/form-date-picker.svelte';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';
import { Textarea } from '$lib/shared/ui/textarea/index.js';

let { data, patients }: { data: PatientListData; patients: Patients } = $props();
let creating = $state(false);
let busy = $state(false);
let bpjs = $state(false);
let error = $state('');
let notice = $state('');
let savedId = $state('');
let nameInput = $state<HTMLInputElement | null>(null);
const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const birthYears = Array.from({ length: Number(today.slice(0, 4)) - 1899 }, (_, index) => 1900 + index);
const currentPage = $derived(data.offset / 25 + 1);
const pageHref = (page: number) => `/patients?${new URLSearchParams({ q: data.search, page: String(page) })}`;

async function toggleForm() {
    creating = !creating;
    error = '';
    bpjs = false;
    if (creating) { await tick(); nameInput?.focus(); }
}

function reportInvalid(event: Event) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.form?.querySelector(':invalid:not(fieldset)') !== field) return;
    if (field.name === 'bpjsNumber') error = 'Isi Nomor BPJS dengan 13 digit.';
    if (field.name === 'name') error = 'Isi Nama lengkap dengan maksimal 200 karakter.';
}

async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    busy = true;
    error = '';
    notice = '';
    savedId = '';
    try {
        const patient = await patients.create({
            name: formText(form, 'name').trim(),
            birthDate: formText(form, 'birthDate'),
            gender: formText(form, 'gender') as 'L' | 'P',
            address: formText(form, 'address').trim() || null,
            bpjs,
            bpjsNumber: bpjs ? formText(form, 'bpjsNumber').trim() : null,
        });
        creating = false;
        savedId = patient.id;
        notice = `Pasien ${patient.name} berhasil ditambahkan dengan nomor rekam medis ${patient.medicalRecordNo}. Pasien siap diproses oleh tim perawatan untuk mulai rawat inap.`;
        try {
            await goto(`/patients?${new URLSearchParams({ q: patient.medicalRecordNo })}`, { refreshAll: true, reset: true });
        } catch {
            error = 'Pasien sudah tersimpan, tetapi daftar belum dapat dimuat ulang. Buka ringkasan pasien atau muat ulang halaman.';
        }
    } catch (failure) {
        error = isUnconfirmedSave(failure)
            ? 'Data pasien belum dapat dipastikan tersimpan. Cari nama pasien di daftar sebelum mendaftarkan ulang.'
            : sessionFailure(failure, 'save', 'data pasien');
    } finally {
        busy = false;
    }
}
</script>

<svelte:head><title>Data pasien | InpaCare</title></svelte:head>

<div class="flex flex-col gap-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0"><h1 class="text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[28px]">Data pasien</h1></div>
        <Button class="h-11 shrink-0 px-4" aria-expanded={creating} aria-controls="patient-registration" disabled={busy} onclick={toggleForm}><Plus aria-hidden="true" /> Tambah pasien</Button>
    </header>
    {#if notice}<p class="rounded-lg border border-success/20 bg-success-soft p-4 text-sm text-success" role="status">{notice} <a class="underline underline-offset-4" href={`/patients/${savedId}`}>Lihat ringkasan pasien</a></p>{/if}
    {#if error}<p class="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</p>{/if}

    {#if creating}
    <Card id="patient-registration" aria-labelledby="registration-title">
        <CardHeader><CardTitle id="registration-title" role="heading" aria-level={2}>Tambah pasien</CardTitle><CardDescription>Pastikan pasien belum terdaftar. Setiap pasien menggunakan satu nomor rekam medis yang unik.</CardDescription></CardHeader>
        <CardContent>
            <form onsubmit={create} oninvalidcapture={reportInvalid} aria-busy={busy}>
                <fieldset class="grid min-w-0 gap-5 sm:grid-cols-2" disabled={busy}>
                    <legend class="sr-only">Identitas pasien baru</legend>
                    <Field><FieldLabel for="patient-record-number">Nomor rekam medis</FieldLabel><Input id="patient-record-number" value="Dibuat otomatis saat disimpan" readonly class="h-11 bg-muted text-base text-muted-foreground md:text-base" /></Field>
                    <Field><FieldLabel for="patient-name">Nama lengkap</FieldLabel><Input id="patient-name" bind:ref={nameInput} name="name" required maxlength={200} autocomplete="off" class="h-11 text-base md:text-base" /></Field>
                    <Field><FieldLabel for="patient-birth-date">Tanggal lahir</FieldLabel><FormDatePicker id="patient-birth-date" name="birthDate" max={today} captionLayout="dropdown" years={birthYears} required disabled={busy} class="text-base md:text-base" /></Field>
                    <Field><FieldLabel for="patient-gender">Jenis kelamin</FieldLabel><FormSelect id="patient-gender" name="gender" required disabled={busy} options={[{ value: '', label: 'Pilih jenis kelamin' }, { value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} /></Field>
                    <Field class="sm:col-span-2"><FieldLabel for="patient-address">Alamat (opsional)</FieldLabel><Textarea id="patient-address" name="address" maxlength={1000} rows={2} class="text-base md:text-base" /></Field>
                    <div class="flex min-h-11 items-center gap-3"><Checkbox id="patient-bpjs" bind:checked={bpjs} disabled={busy} /><FieldLabel for="patient-bpjs" class="cursor-pointer">Peserta BPJS</FieldLabel></div>
                    {#if bpjs}<Field><FieldLabel for="patient-bpjs-number">Nomor BPJS</FieldLabel><Input id="patient-bpjs-number" name="bpjsNumber" inputmode="numeric" pattern={'[0-9]{13}'} minlength={13} maxlength={13} required aria-describedby="bpjs-help" class="h-11 text-base md:text-base" /><p id="bpjs-help" class="text-sm text-muted-foreground">Masukkan 13 digit nomor peserta BPJS.</p></Field>{/if}
                    <div class="flex flex-wrap justify-end gap-3 border-t pt-4 sm:col-span-2"><Button variant="outline" class="h-11 px-4" type="button" onclick={toggleForm} disabled={busy}>Batal</Button><Button class="h-11 px-4" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pasien'}</Button></div>
                </fieldset>
            </form>
        </CardContent>
    </Card>
    {/if}

    <Card class="gap-0 py-0" aria-label="Daftar pasien">
        <CardContent class="px-0">
            <form class="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:px-5" action="/patients" method="GET">
                <Field class="min-w-0 flex-1 sm:max-w-[560px]"><FieldLabel for="patient-search">Cari pasien</FieldLabel><Input id="patient-search" type="search" name="q" value={data.search} maxlength={200} placeholder="Nama pasien atau nomor rekam medis" class="h-11 text-base md:text-base" /></Field>
                <Button variant="outline" class="h-11 px-4" type="submit">Cari</Button>
                {#if data.search}<Button variant="ghost" class="h-11" href="/patients">Hapus pencarian</Button>{/if}
            </form>
            <Table><TableHeader><TableRow class="bg-muted/60 hover:bg-muted/60"><TableHead class="px-4 sm:px-5">Nama / No. RM</TableHead><TableHead>Tanggal lahir</TableHead><TableHead>Jenis kelamin</TableHead><TableHead>BPJS</TableHead><TableHead class="px-4 text-right sm:px-5">Aksi</TableHead></TableRow></TableHeader><TableBody>
                {#each data.patients.items as patient (patient.id)}
                <TableRow><TableCell class="px-4 align-top sm:px-5"><strong class="block text-sm">{patient.name}</strong><span class="mt-1 block text-xs text-muted-foreground">{patient.medicalRecordNo}</span></TableCell><TableCell>{date(patient.birthDate)}</TableCell><TableCell>{patient.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</TableCell><TableCell>{patient.bpjs ? 'Terdaftar' : 'Tidak terdaftar'}</TableCell><TableCell class="px-4 text-right sm:px-5"><Button variant="outline" class="h-11" href={`/patients/${patient.id}`}>Lihat ringkasan</Button></TableCell></TableRow>
                {:else}<TableRow><TableCell colspan={5} class="px-4 py-11 text-center text-sm whitespace-normal text-muted-foreground">{data.search ? 'Tidak ada pasien yang cocok. Coba nama atau nomor rekam medis lain.' : 'Belum ada pasien terdaftar. Pilih Tambah pasien untuk mendaftarkan pasien pertama.'}</TableCell></TableRow>{/each}
            </TableBody></Table>
            <nav class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 sm:px-5" aria-label="Halaman daftar pasien">
                <span class="text-sm text-muted-foreground">{data.patients.total} pasien · Halaman {currentPage}</span>
                <div class="flex flex-wrap gap-3">{#if data.offset > 0}<Button variant="outline" class="h-11" href={pageHref(currentPage - 1)}>Sebelumnya</Button>{/if}{#if data.offset + 25 < data.patients.total}<Button variant="outline" class="h-11" href={pageHref(currentPage + 1)}>Berikutnya</Button>{/if}</div>
            </nav>
        </CardContent>
    </Card>
</div>
