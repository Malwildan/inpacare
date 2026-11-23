import { test, expect, type APIRequestContext } from '@playwright/test';

async function signIn(api: APIRequestContext, username: string) {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const response = await api.post('/api/v1/session', {
        headers: { origin },
        data: { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' },
    });
    expect(response.status(), await response.text()).toBe(200);
    const { user } = await response.json();
    return { origin, 'x-csrf-token': user.csrfToken };
}

test('nurse observations made before a record are visible to the attending doctor', async ({ page }) => {
    const admissions = await signIn(page.request, 'admisi');
    const patientResponse = await page.request.post('/api/v1/patients', {
        headers: admissions,
        data: { name: `Pasien Observasi ${Date.now()}`, birthDate: '2000-01-01', gender: 'P', bpjs: false },
    });
    expect(patientResponse.status(), await patientResponse.text()).toBe(200);
    const patient = await patientResponse.json();
    const nurse = await signIn(page.request, 'dina');
    const cycleResponse = await page.request.post('/api/v1/cycles', {
        headers: nurse,
        data: { patientId: patient.id, doctorId: 'USR-DOCTOR-1' },
    });
    expect(cycleResponse.status(), await cycleResponse.text()).toBe(201);

    const dashboard = `/dashboard?patientId=${patient.id}&search=${patient.medicalRecordNo}`;
    await page.goto(dashboard);
    await expect(page.getByRole('searchbox', { name: 'Cari nama atau nomor rekam medis' })).toHaveValue(patient.medicalRecordNo, { timeout: 20_000 });
    await page.getByRole('button', { name: 'Lihat detail' }).click();
    await page.getByRole('button', { name: 'Observasi keperawatan' }).click();
    await expect(page.getByText('Belum ada observasi keperawatan.')).toBeVisible();
    await page.getByRole('button', { name: 'Tambah observasi' }).click();
    await page.getByLabel('Gejala/kondisi').fill('Keluhan berkurang setelah beristirahat');
    await page.getByLabel('Suhu (°C)').fill('36.55');
    await page.getByLabel('Sistolik (mmHg)').fill('120');
    await page.getByRole('button', { name: 'Simpan observasi' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Tekanan darah belum lengkap' })).toBeVisible();
    await expect(page.getByLabel('Gejala/kondisi')).toHaveValue('Keluhan berkurang setelah beristirahat');
    await page.getByLabel('Diastolik (mmHg)').fill('80');
    await page.getByRole('button', { name: 'Simpan observasi' }).click();
    await expect(page.getByText('Observasi tersimpan.')).toBeVisible();
    await expect(page.getByText('120/80')).toBeVisible();

    await signIn(page.request, 'hendra');
    await page.goto(dashboard);
    await expect(page.getByRole('searchbox', { name: 'Cari nama atau nomor rekam medis' })).toHaveValue(patient.medicalRecordNo, { timeout: 20_000 });
    await page.getByRole('button', { name: 'Lihat detail' }).click();
    await page.getByRole('button', { name: 'Observasi keperawatan' }).click();
    await expect(page.getByText('Keluhan berkurang setelah beristirahat')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tambah observasi' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Kembali ke detail' }).click();
    await page.getByRole('link', { name: 'Tambah rekam medis' }).click();
    await expect(page.getByRole('dialog').getByText(patient.name)).toBeVisible();
    await page.getByLabel('Keluhan', { exact: true }).fill('Keluhan sintetis');
    await page.getByLabel('Diagnosis', { exact: true }).fill('Diagnosis sintetis');
    await page.getByLabel('Tindakan', { exact: true }).fill('Tindakan sintetis');
    await page.getByRole('button', { name: 'Simpan rekam medis' }).click();
    await expect(page).toHaveURL(/\/medical-records\/[^/]+$/);
    await expect(page.getByText('Keluhan berkurang setelah beristirahat')).toBeVisible();
    await expect(page.getByText('120/80')).toBeVisible();
});
