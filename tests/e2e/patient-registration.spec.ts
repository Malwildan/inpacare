import { test, expect, type Page } from '@playwright/test';
import { selectOption } from '../select-option.mjs';
import { selectDate } from '../select-date.mjs';

const draft = { name: 'Pasien Registrasi Sintetis', birthDate: '2000-02-29', gender: 'P', bpjs: false };
async function signIn(page: Page, username: string) {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const session = await page.request.post('/api/v1/session', {
        headers: { origin },
        data: { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' },
    });
    expect(session.status()).toBe(200);
    await page.goto(username === 'admisi' ? '/patients' : '/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /Keluar/ })).toBeVisible();
}
async function headers(page: Page) {
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf_token')!.value;
    return { origin: new URL(page.url()).origin, 'x-csrf-token': csrf };
}

test('admissions registers with a generated record number and finds it after reload', async ({ page }, testInfo) => {
    await signIn(page, 'admisi');
    await page.getByRole('button', { name: 'Tambah pasien', exact: true }).click();
    await expect(page.getByLabel('Nama lengkap')).toBeFocused();
    await expect(page.getByLabel('Nomor rekam medis', { exact: true })).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Nomor rekam medis', { exact: true })).toHaveValue('Dibuat otomatis saat disimpan');
    await page.getByLabel('Nama lengkap').fill(draft.name);
    await selectDate(page.getByLabel('Tanggal lahir', { exact: true }), draft.birthDate);
    await selectOption(page.getByRole('combobox', { name: 'Jenis kelamin', exact: true }), draft.gender);
    await page.getByLabel('Alamat (opsional)').fill('Alamat pasien sintetis');
    await page.getByLabel('Peserta BPJS').check();
    await page.getByLabel('Nomor BPJS', { exact: true }).fill('0001234567890');
    await page.screenshot({ path: testInfo.outputPath('registration-desktop.png'), fullPage: true });
    const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/patients') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Simpan pasien', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).not.toHaveProperty('medicalRecordNo');
    const { medicalRecordNo } = await response.json();
    expect(medicalRecordNo).toMatch(/^RM-\d{5,}$/);
    await expect(page.getByRole('status')).toContainText('berhasil ditambahkan');
    const row = page.getByRole('row').filter({ hasText: medicalRecordNo });
    await expect(row).toContainText(draft.name);
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: medicalRecordNo })).toBeVisible();
    await page.getByRole('link', { name: 'Lihat ringkasan', exact: true }).click();
    await expect(page.getByRole('heading', { name: draft.name, exact: true })).toBeVisible();
    await expect(page.getByText('0001234567890', { exact: true })).toBeVisible();
    const context = await page.request.get('/api/v1/reference');
    expect((await context.json()).patients.some((patient: { medicalRecordNo: string }) => patient.medicalRecordNo === medicalRecordNo)).toBe(true);
    const next = await page.request.post('/api/v1/patients', { headers: await headers(page), data: draft });
    expect(next.status()).toBe(200);
    expect((await next.json()).medicalRecordNo).not.toBe(medicalRecordNo);
});

test('registration keeps a rejected draft and fits a mobile viewport', async ({ page }, testInfo) => {
    await signIn(page, 'admisi');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/patients');
    await page.getByRole('button', { name: 'Tambah pasien', exact: true }).click();
    await page.getByLabel('Nama lengkap').fill(draft.name);
    const birthDate = page.getByLabel('Tanggal lahir', { exact: true });
    await birthDate.focus();
    await birthDate.press('Enter');
    const calendar = page.locator('[data-calendar-root]');
    await expect(calendar.getByLabel('Tahun', { exact: true })).toBeVisible();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await expect(calendar.locator(`[data-calendar-cell][data-value="${today}"] [data-calendar-day]`).first()).not.toBeDisabled();
    await calendar.getByLabel('Tahun', { exact: true }).selectOption(String(Number(today.slice(0, 4))));
    const future = calendar.locator('[data-calendar-cell]:not([data-outside-month]) [data-calendar-day][data-disabled]');
    if (Number(today.slice(8)) < new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()) await expect(future.first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('birth-date-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(birthDate).toBeFocused();
    await selectDate(birthDate, draft.birthDate);
    await selectOption(page.getByRole('combobox', { name: 'Jenis kelamin', exact: true }), draft.gender);
    let writes = 0;
    await page.route('**/api/v1/patients', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        writes++;
        if (writes === 1) {
            return route.fulfill({ status: 422, json: { error: { code: 'VALIDATION_FAILED', message: 'Isi Nama lengkap dengan maksimal 200 karakter.' } } });
        }
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>SQLSTATE: unexpected upstream response</p>' });
    });
    const submit = page.getByRole('button', { name: 'Simpan pasien', exact: true });
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('Isi Nama lengkap dengan maksimal 200 karakter.');
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('Data pasien belum dapat dipastikan tersimpan. Cari nama pasien di daftar sebelum mendaftarkan ulang.');
    await expect(page.getByText(/SQLSTATE/)).toHaveCount(0);
    await expect(page.getByLabel('Nama lengkap')).toHaveValue(draft.name);
    await expect(birthDate).toHaveAttribute('data-value', draft.birthDate);
    expect(writes).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath('registration-mobile-error.png'), fullPage: true });
});

for (const username of ['hendra', 'dina', 'rina']) {
    test(`${username} cannot open registration or create patients through the API`, async ({ page }) => {
        await signIn(page, username);
        await expect(page.getByRole('link', { name: 'Data pasien', exact: true })).toHaveCount(0);
        const response = await page.goto('/patients');
        expect(response?.status()).toBe(403);
        await expect(page.getByRole('heading', { name: 'Akses terbatas' })).toBeVisible();
        await page.getByRole('link', { name: 'Kembali ke halaman utama' }).click();
        await expect(page).toHaveURL(/\/dashboard$/);
        const before = await page.request.get('/api/v1/patients');
        const count = (await before.json()).total;
        const denied = await page.request.post('/api/v1/patients', { headers: await headers(page), data: draft });
        expect(denied.status()).toBe(403);
        expect((await (await page.request.get('/api/v1/patients')).json()).total).toBe(count);
        if (username !== 'hendra') expect((await page.request.get('/patients/PT-001')).status()).toBe(200);
    });
}

test('registration enforces session, CSRF and server validation', async ({ page }) => {
    const anonymous = await page.request.post('/api/v1/patients', { data: draft });
    expect(anonymous.status()).toBe(401);
    await signIn(page, 'admisi');
    expect((await page.request.post('/api/v1/patients', { data: draft })).status()).toBe(403);
    const badDate = await page.request.post('/api/v1/patients', {
        headers: await headers(page), data: { ...draft, birthDate: '2001-02-29' },
    });
    expect(badDate.status()).toBe(422);
    expect(await badDate.json()).toEqual({ error: {
        code: 'VALIDATION_FAILED', message: 'Tanggal lahir tidak valid. Pilih tanggal pada kalender.',
    } });
    for (const fields of [{ name: ' ' }, { birthDate: '9999-01-01' }, { bpjs: true }, { bpjs: true, bpjsNumber: 'abc' }, { role: 'ADMISI' }, { medicalRecordNo: 'RM-00001' }]) {
        const invalid = await page.request.post('/api/v1/patients', { headers: await headers(page), data: { ...draft, ...fields } });
        expect(invalid.status()).toBe(422);
    }
});

test('patient search remains paginated across navigation and reload', async ({ page }) => {
    await signIn(page, 'admisi');
    const marker = `PAGE-${Date.now()}`;
    const requestHeaders = await headers(page);
    for (let index = 0; index < 26; index++) {
        const response = await page.request.post('/api/v1/patients', {
            headers: requestHeaders,
            data: { ...draft, name: `${marker} Pasien ${String(index).padStart(2, '0')}` },
        });
        expect(response.status()).toBe(200);
    }
    await page.goto(`/patients?q=${marker}`);
    await expect(page.locator('tbody tr')).toHaveCount(25);
    await page.getByRole('link', { name: 'Berikutnya', exact: true }).click();
    await expect(page.getByLabel('Cari pasien', { exact: true })).toHaveValue(marker);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('link', { name: 'Sebelumnya', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(25);
});
