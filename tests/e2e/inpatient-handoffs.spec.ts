import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { selectDate } from '../select-date.mjs';
import { selectOption } from '../select-option.mjs';

const password = process.env.SEED_DEMO_PASSWORD ?? 'InpaCareDemo!2026';
const jakartaDate = (days: number) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + days * 86400000));

async function signIn(browser: Browser, baseURL: string, username: string) {
    const context = await browser.newContext({ baseURL });
    const response = await context.request.post('/api/v1/session', {
        headers: { Origin: baseURL }, data: { username, password },
    });
    expect(response.status(), await response.text()).toBe(200);
    const { user } = await response.json();
    const page = await context.newPage();
    const headers = { Origin: baseURL, 'x-csrf-token': user.csrfToken };
    return { page, user, headers };
}

async function visit(page: Page, path: string) {
    // Wait for the local SvelteKit client to load before clicking server-rendered controls.
    await page.goto(path, { waitUntil: 'networkidle' });
}

async function write(client: { page: Page; headers: Record<string, string> }, method: string, path: string, data: unknown, status: number) {
    const response = await client.page.request.fetch(`/api/v1${path}`, { method, headers: client.headers, data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
}

test('registration offers the new patient to the nurse and opens the existing waiting flow', async ({ browser, baseURL }) => {
    const admissions = await signIn(browser, baseURL!, 'admisi');
    const nurse = await signIn(browser, baseURL!, 'dina');
    const name = `Pasien antrean ${randomUUID().slice(0, 8)}`;
    await visit(admissions.page, '/patients');
    await admissions.page.getByRole('button', { name: 'Tambah pasien', exact: true }).click();
    await admissions.page.getByLabel('Nama lengkap').fill(name);
    await selectDate(admissions.page.getByLabel('Tanggal lahir', { exact: true }), '2000-02-29');
    await selectOption(admissions.page.getByRole('combobox', { name: 'Jenis kelamin', exact: true }), 'P');
    const registration = admissions.page.waitForResponse(response =>
        response.url().endsWith('/api/v1/patients') && response.request().method() === 'POST');
    await admissions.page.getByRole('button', { name: 'Simpan pasien', exact: true }).click();
    const response = await registration;
    expect(response.status()).toBe(200);
    const patient = await response.json();
    await expect(admissions.page.getByRole('status')).toContainText('Pasien siap diproses oleh tim perawatan');

    await visit(nurse.page, '/dashboard');
    await nurse.page.getByLabel('Cari pasien baru').fill(patient.medicalRecordNo);
    const start = nurse.page.getByRole('button', { name: `Mulai rawat inap untuk ${name} (${patient.medicalRecordNo})` });
    await start.click();
    const form = nurse.page.getByRole('dialog', { name: 'Mulai rawat inap', exact: true });
    await expect(form.getByRole('combobox', { name: 'Pasien terdaftar', exact: true })).toHaveAttribute('data-value', patient.id);
    const staff = await (await nurse.page.request.get('/api/v1/staff')).json();
    const doctor = staff.items.find((person: { role: string }) => person.role === 'DOKTER');
    await selectOption(form.getByRole('combobox', { name: 'Dokter penanggung jawab', exact: true }), doctor.id);
    await form.getByRole('button', { name: 'Simpan sebagai Menunggu', exact: true }).click();
    const detail = nurse.page.getByRole('dialog', { name: 'Detail rekap rawat inap' });
    await expect(detail).toContainText(name);
    await expect(detail).toContainText('Menunggu');
    await nurse.page.reload({ waitUntil: 'networkidle' });
    await nurse.page.getByLabel('Cari pasien baru').fill(patient.medicalRecordNo);
    await expect(start).toHaveCount(0);
    await nurse.page.getByRole('button', { name: 'Mulai rawat inap', exact: true }).click();
    await form.getByLabel('Cari pasien terdaftar').fill(patient.medicalRecordNo);
    await expect(form.getByRole('combobox', { name: 'Pasien terdaftar', exact: true })).toHaveAttribute('data-value', '');
});

test('blocking task links back to the same cycle and approved release opens billing with context', async ({ browser, baseURL }) => {
    const admissions = await signIn(browser, baseURL!, 'admisi');
    const nurse = await signIn(browser, baseURL!, 'dina');
    const coordinator = await signIn(browser, baseURL!, 'rina');
    const doctor = await signIn(browser, baseURL!, 'hendra');
    const tag = randomUUID().slice(0, 8);
    const patient = await write(admissions, 'POST', '/patients', {
        name: `Pasien pelepasan ${tag}`, birthDate: '1990-01-01', gender: 'P', bpjs: false,
    }, 200);
    const room = await write(coordinator, 'POST', '/rooms', {
        name: `Ruang pelepasan ${tag}`, roomClass: 'Uji', capacity: 1, dailyRate: '10000',
    }, 200);
    const cycle = await write(nurse, 'POST', '/cycles', {
        patientId: patient.id, doctorId: doctor.user.id,
        newPlacement: { roomId: room.id, startsOn: jakartaDate(0), endsOn: jakartaDate(2) },
    }, 201);
    const path = `/cycles/${cycle.id}`;
    await write(nurse, 'PATCH', path, { status: 'in_care', expectedVersion: 1 }, 200);
    const task = await write(coordinator, 'POST', '/tasks', {
        patientId: patient.id, placementId: cycle.placementId, picId: nurse.user.id, title: `Tugas pelepasan ${tag}`,
        startsAt: `${jakartaDate(1)}T09:00:00+07:00`, endsAt: `${jakartaDate(1)}T10:00:00+07:00`, priority: 'normal',
    }, 200);

    await visit(nurse.page, `/dashboard?cycle=${cycle.id}`);
    const readiness = nurse.page.getByRole('region', { name: 'Kesiapan pelepasan' });
    await expect(readiness).toContainText('Belum dikerjakan');
    await expect(readiness).toContainText(nurse.user.name);
    await expect(readiness).toContainText('09.00');
    await readiness.getByRole('link', { name: `Buka tugas ${task.title}` }).click();
    await expect(nurse.page).toHaveURL(new RegExp(`/tasks\\?task=${task.id}&cycle=${cycle.id}$`));
    const taskDetail = nurse.page.getByRole('dialog', { name: task.title, exact: true });
    await expect(taskDetail.getByRole('button', { name: 'Batalkan dengan alasan' })).toHaveCount(0);
    for (const status of ['in_progress', 'done']) {
        await taskDetail.getByRole('button', { name: 'Pindahkan', exact: true }).click();
        const move = nurse.page.getByRole('dialog', { name: `Pindahkan ${task.title}` });
        await selectOption(move.getByRole('combobox', { name: 'Status tujuan' }), status);
        await move.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
        await expect(move).toHaveCount(0);
        if (status === 'in_progress') await nurse.page.reload({ waitUntil: 'networkidle' });
    }
    await nurse.page.getByRole('link', { name: 'Kembali ke rekap pasien' }).click();
    await expect(nurse.page).toHaveURL(new RegExp(`/dashboard\\?cycle=${cycle.id}$`));
    await expect(readiness).toContainText('Siap diajukan ke dokter');
    await expect(readiness).not.toContainText(task.title);
    await nurse.page.getByRole('button', { name: 'Ajukan perpanjangan / pelepasan' }).click();
    await nurse.page.getByLabel('Alasan', { exact: true }).fill('Alasan klinis sintetis');
    await nurse.page.getByRole('button', { name: 'Ajukan ke dokter' }).click();
    await expect(readiness).toContainText('Pengajuan pelepasan menunggu keputusan dokter');

    await visit(doctor.page, `/dashboard?cycle=${cycle.id}`);
    await doctor.page.getByRole('button', { name: 'Tinjau keputusan' }).click();
    await doctor.page.getByLabel('Catatan keputusan').fill('Catatan dokter sintetis');
    await doctor.page.getByRole('button', { name: 'Setujui', exact: true }).click();
    await expect(doctor.page.getByRole('status')).toContainText('Perubahan berhasil disimpan.');

    await visit(admissions.page, '/invoices');
    const queue = admissions.page.getByRole('region', { name: 'Antrean administrasi akhir' });
    const episode = queue.getByRole('listitem').filter({ hasText: cycle.id });
    await expect(episode).toHaveCount(1);
    await expect(episode).toContainText(patient.medicalRecordNo);
    await expect(episode).toContainText(room.name);
    await expect(queue).not.toContainText('Catatan dokter sintetis');
    await expect(episode).toContainText('Belum ada tagihan');

    const contextPath = `**/api/v1/invoices/patients/${patient.id}/context`;
    await admissions.page.route(contextPath, route => route.abort());
    const create = episode.getByRole('button', { name: `Buat tagihan untuk ${patient.name} (${cycle.id})` });
    await create.click();
    const invoice = admissions.page.getByRole('dialog', { name: 'Buat tagihan baru' });
    await expect(invoice.getByRole('button', { name: 'Simpan tagihan' })).toBeDisabled();
    await expect(admissions.page.getByText(/Daftar penempatan pasien gagal dimuat/)).toBeVisible();
    await invoice.getByRole('button', { name: 'Batal', exact: true }).click();
    await admissions.page.unroute(contextPath);
    await admissions.page.reload({ waitUntil: 'networkidle' });
    await create.click();
    await expect(invoice.getByRole('combobox', { name: 'Pasien', exact: true })).toHaveAttribute('data-value', patient.id);
    await expect(invoice.getByRole('combobox', { name: 'Penempatan', exact: true })).toHaveAttribute('data-value', cycle.placementId);
    await invoice.getByRole('button', { name: 'Simpan tagihan' }).click();
    const existing = episode.getByRole('button', { name: /Buka tagihan .* Belum lunas/i });
    await existing.click();
    await expect(admissions.page.getByRole('dialog', { name: 'Rincian tagihan' })).toContainText(patient.name);
    await expect(create).toHaveCount(0);

    await visit(nurse.page, '/dashboard');
    await nurse.page.getByLabel('Cari pasien baru').fill(patient.medicalRecordNo);
    await expect(nurse.page.getByRole('button', { name: new RegExp(`Mulai rawat inap untuk ${patient.name}`) })).toHaveCount(0);
    await nurse.page.getByRole('button', { name: 'Mulai rawat inap', exact: true }).click();
    const returning = nurse.page.getByRole('dialog', { name: 'Mulai rawat inap', exact: true });
    await returning.getByLabel('Cari pasien terdaftar').fill(patient.medicalRecordNo);
    await selectOption(returning.getByRole('combobox', { name: 'Pasien terdaftar', exact: true }), patient.id);
    await expect(returning.getByRole('combobox', { name: 'Pasien terdaftar', exact: true })).toHaveAttribute('data-value', patient.id);
});
