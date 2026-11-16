import { test, expect, type Page } from '@playwright/test';
import { selectOption } from '../select-option.mjs';

const draft = { medicalRecordNo: '', name: 'Pasien Registrasi Sintetis', birthDate: '2000-02-29', gender: 'P', bpjs: false };
async function signIn(page: Page, username: string) {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const session = await page.request.post('/api/v1/session', {
        headers: { origin },
        data: { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' },
    });
    expect(session.status()).toBe(200);
    await page.goto(username === 'admisi' ? '/patients' : '/dashboard');
    await expect(page.getByRole('button', { name: /Keluar/ })).toBeVisible();
}
async function headers(page: Page) {
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf_token')!.value;
    return { origin: new URL(page.url()).origin, 'x-csrf-token': csrf };
}

test('admissions registers a patient, finds the saved identity after reload, and rejects duplicates', async ({ page }, testInfo) => {
    await signIn(page, 'admisi');
    await page.getByRole('navigation', { name: 'Navigasi utama', exact: true }).getByRole('link', { name: 'Data Pasien', exact: true }).click();
    await page.getByRole('button', { name: 'Tambah Pasien', exact: true }).click();
    await expect(page.getByLabel('Nomor rekam medis', { exact: true })).toBeFocused();
    const medicalRecordNo = `RM-E2E-${Date.now()}`;
    await page.getByLabel('Nomor rekam medis', { exact: true }).fill(medicalRecordNo);
    await page.getByLabel('Nama lengkap').fill(draft.name);
    await page.getByLabel('Tanggal lahir', { exact: true }).fill(draft.birthDate);
    await selectOption(page.getByRole('combobox', { name: 'Jenis kelamin', exact: true }), draft.gender);
    await page.getByLabel('Alamat (opsional)').fill('Alamat pasien sintetis');
    await page.getByLabel('Peserta BPJS').check();
    await page.getByLabel('Nomor BPJS', { exact: true }).fill('0001234567890');
    await page.screenshot({ path: testInfo.outputPath('registration-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Simpan pasien', exact: true }).click();
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
    const duplicate = await page.request.post('/api/v1/patients', { headers: await headers(page), data: { ...draft, medicalRecordNo } });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).error.message).toContain('sudah terdaftar');
});

test('registration keeps a rejected draft and fits a mobile viewport', async ({ page }, testInfo) => {
    await signIn(page, 'admisi');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/patients');
    await page.getByRole('button', { name: 'Tambah Pasien', exact: true }).click();
    await page.getByLabel('Nomor rekam medis', { exact: true }).fill('RM-DRAFT-TEST');
    await page.getByLabel('Nama lengkap').fill(draft.name);
    await page.getByLabel('Tanggal lahir', { exact: true }).fill(draft.birthDate);
    await selectOption(page.getByRole('combobox', { name: 'Jenis kelamin', exact: true }), draft.gender);
    let writes = 0;
    await page.route('**/api/v1/patients', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        writes++;
        await route.fulfill({ status: 409, json: { error: { code: 'CONFLICT', message: 'Nomor rekam medis sudah terdaftar.' } } });
    });
    await page.getByRole('button', { name: 'Simpan pasien', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('sudah terdaftar');
    await expect(page.getByLabel('Nama lengkap')).toHaveValue(draft.name);
    expect(writes).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath('registration-mobile-error.png'), fullPage: true });
});

for (const username of ['hendra', 'dina', 'rina']) {
    test(`${username} cannot open registration or create patients through the API`, async ({ page }) => {
        await signIn(page, username);
        await expect(page.getByRole('link', { name: 'Data Pasien', exact: true })).toHaveCount(0);
        const response = await page.request.get('/patients');
        expect(response.status()).toBe(403);
        const before = await page.request.get('/api/v1/patients');
        const count = (await before.json()).total;
        const denied = await page.request.post('/api/v1/patients', { headers: await headers(page), data: { ...draft, medicalRecordNo: `RM-DENIED-${username}` } });
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
    const valid = { ...draft, medicalRecordNo: `RM-INVALID-${Date.now()}` };
    for (const fields of [{ name: ' ' }, { birthDate: '2001-02-29' }, { birthDate: '9999-01-01' }, { bpjs: true }, { bpjs: true, bpjsNumber: 'abc' }, { role: 'ADMISI' }]) {
        const invalid = await page.request.post('/api/v1/patients', { headers: await headers(page), data: { ...valid, ...fields } });
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
            data: { ...draft, medicalRecordNo: `${marker}-${index}`, name: `${marker} Pasien ${String(index).padStart(2, '0')}` },
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
