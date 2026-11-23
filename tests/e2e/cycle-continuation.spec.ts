import { selectOption } from '../select-option.mjs';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

test.setTimeout(60_000);

// Run against the local synthetic database, as described in BROWSER_TESTS.md.
async function signIn(api: APIRequestContext, username: string) {
    const response = await api.post('/api/v1/session', {
        headers: { origin: new URL(test.info().project.use.baseURL!).origin },
        data: { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' },
    });
    expect(response.status()).toBe(200);
}

async function write(api: APIRequestContext, method: 'POST' | 'PATCH', path: string, data: unknown) {
    const state = await api.storageState();
    const response = await api.fetch(`/api/v1${path}`, {
        method,
        headers: {
            origin: new URL(test.info().project.use.baseURL!).origin,
            'x-csrf-token': state.cookies.find(cookie => cookie.name === 'csrf_token')!.value,
        },
        data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
}

async function setup(page: Page, placementStarted = false) {
    await signIn(page.request, 'admisi');
    const patient = await write(page.request, 'POST', '/patients', {
        name: `Pasien Kelanjutan Sintetis ${Date.now()}`, birthDate: '2000-01-01', gender: 'P', bpjs: false,
    });
    const marker = patient.medicalRecordNo;
    let roomId = 'RG-001';
    if (placementStarted) {
        await signIn(page.request, 'rina');
        const room = await write(page.request, 'POST', '/rooms', {
            name: `Ruang Kelanjutan ${marker}`, roomClass: 'Uji', capacity: 1, dailyRate: '0',
        });
        roomId = room.id;
    }
    await signIn(page.request, 'dina');
    const cycle = await write(page.request, 'POST', '/cycles', { patientId: patient.id, doctorId: 'USR-DOCTOR-1' });
    // Separate future periods keep synthetic placements from consuming the seeded capacity.
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const starts = new Date(placementStarted ? `${today}T00:00:00Z` : '2035-01-01T00:00:00Z');
    if (!placementStarted) starts.setUTCDate(starts.getUTCDate() + test.info().line * 4 + (Math.floor(Date.now() / 1000) % 10_000) * 2);
    const ends = new Date(starts);
    ends.setUTCDate(ends.getUTCDate() + 1);
    const placement = await write(page.request, 'POST', '/placements', {
        patientId: patient.id, roomId, startsOn: starts.toISOString().slice(0, 10), endsOn: ends.toISOString().slice(0, 10),
    });
    const url = `/dashboard?search=${marker}&patientId=${patient.id}&status=pending`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.getByText(marker, { exact: true })).toBeVisible();
    return { cycle, placement, patient, marker, url, detail };
}

test('placement, status and request continue in one detail using each new server version', async ({ page }) => {
    const { cycle, placement, patient, marker, url, detail } = await setup(page, true);
    await expect(detail.getByRole('button', { name: 'Konfirmasi sudah ditempatkan' })).toHaveCount(0);
    const versions: number[] = [];
    page.on('request', request => {
        if (request.method() === 'PATCH' && request.url().endsWith(`/cycles/${cycle.id}`)) versions.push(request.postDataJSON().expectedVersion);
    });
    await detail.getByRole('button', { name: 'Ubah penempatan', exact: true }).click();
    await selectOption(detail.getByRole('combobox', { name: /^Penempatan/ }), placement.id);
    await detail.getByRole('button', { name: 'Simpan penempatan' }).click();
    await expect(detail.getByRole('status')).toHaveText('Perubahan berhasil disimpan.');
    await expect(detail.getByRole('button', { name: 'Konfirmasi sudah ditempatkan' })).toBeEnabled();
    await detail.getByRole('button', { name: 'Konfirmasi sudah ditempatkan' }).click();
    await expect(detail.getByRole('button', { name: 'Mulai perawatan' })).toBeEnabled();
    await detail.getByRole('button', { name: 'Mulai perawatan' }).click();
    await expect(detail.getByRole('button', { name: 'Ajukan perpanjangan / pelepasan' })).toBeEnabled();
    expect(versions).toEqual([1, 2, 3]);
    const saved = await (await page.request.get(`/api/v1/cycles/${cycle.id}`)).json();
    expect(saved).toMatchObject({ status: 'in_care', placementId: placement.id, version: 4 });
    await detail.getByRole('button', { name: 'Ajukan perpanjangan / pelepasan' }).click();
    await detail.getByLabel('Alasan', { exact: true }).fill('Pengajuan sintetis dari detail yang tetap terbuka.');
    await detail.getByRole('button', { name: 'Ajukan ke dokter' }).click();
    await expect(detail.getByRole('button', { name: 'Ajukan perpanjangan / pelepasan' })).toBeDisabled();
    await expect(detail.getByText('Menunggu keputusan', { exact: true })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Setujui' })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('cycle-detail-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: test.info().outputPath('cycle-detail-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await detail.getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(url.replace(/[?]/g, '\\?') + '$'));
    await expect(page.getByLabel('Cari nama atau nomor rekam medis')).toHaveValue(marker);
    await expect(page.getByLabel('Cari nama atau nomor rekam medis')).toBeFocused();
    await page.getByRole('button', { name: /Filter rekap/ }).click();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: /^Status/ })).toHaveAttribute('data-value', 'pending');
    await expect(page.getByRole('dialog').getByRole('combobox', { name: /^Pasien/ })).toHaveAttribute('data-value', patient.id);
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(page.locator('tbody')).toContainText('Tidak ada rekap yang cocok.');
});

test('validation and network failures keep the selected placement and allow an intentional retry', async ({ page }) => {
    const { cycle, placement, detail } = await setup(page);
    await detail.getByRole('button', { name: 'Ubah penempatan', exact: true }).click();
    await selectOption(detail.getByRole('combobox', { name: /^Penempatan/ }), placement.id);
    let attempts = 0;
    await page.route(`**/api/v1/cycles/${cycle.id}`, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        attempts++;
        if (attempts === 1) return route.fulfill({ status: 422, json: { error: { code: 'VALIDATION_FAILED', message: 'Penempatan ini milik pasien lain. Pilih penempatan untuk pasien yang dipilih.' } } });
        if (attempts === 2) return route.abort('failed');
        return route.continue();
    });
    await detail.getByRole('button', { name: 'Simpan penempatan' }).click();
    await expect(detail.getByRole('alert')).toContainText('Penempatan ini milik pasien lain');
    await expect(detail.getByRole('combobox', { name: /^Penempatan/ })).toHaveAttribute('data-value', placement.id);
    await detail.getByRole('button', { name: 'Simpan penempatan' }).click();
    await expect(detail.getByRole('alert')).toContainText('Periksa data terbaru sebelum mengirim kembali.');
    await expect(detail.getByRole('combobox', { name: /^Penempatan/ })).toHaveAttribute('data-value', placement.id);
    await expect(detail.getByRole('button', { name: 'Simpan penempatan' })).toBeDisabled();
    await detail.getByRole('button', { name: 'Muat detail terbaru' }).click();
    await expect(detail.getByRole('status')).toContainText('Detail terbaru dimuat');
    await detail.getByRole('button', { name: 'Ubah penempatan', exact: true }).click();
    await selectOption(detail.getByRole('combobox', { name: /^Penempatan/ }), placement.id);
    await detail.getByRole('button', { name: 'Simpan penempatan' }).click();
    await expect(detail.getByRole('button', { name: 'Konfirmasi sudah ditempatkan' })).toBeEnabled();
    expect(attempts).toBe(3);
});

test('a real version conflict reads the latest detail without automatically overwriting another save', async ({ page }) => {
    const { cycle, placement, detail } = await setup(page);
    await detail.getByRole('button', { name: 'Ubah penempatan', exact: true }).click();
    await selectOption(detail.getByRole('combobox', { name: /^Penempatan/ }), placement.id);
    await write(page.request, 'PATCH', `/cycles/${cycle.id}`, { expectedVersion: 1, placementId: placement.id });
    let writes = 0;
    page.on('request', request => { if (request.method() === 'PATCH') writes++; });
    await detail.getByRole('button', { name: 'Simpan penempatan' }).click();
    await expect(detail.getByRole('alert')).toContainText('Data sudah berubah');
    await expect(detail.getByRole('combobox', { name: /^Penempatan/ })).toHaveAttribute('data-value', placement.id);
    await expect(detail.getByRole('button', { name: 'Simpan penempatan' })).toBeDisabled();
    await detail.getByRole('button', { name: 'Muat detail terbaru' }).click();
    await expect(detail.getByRole('status')).toContainText('Detail terbaru dimuat');
    expect(writes).toBe(1);
    await detail.getByRole('button', { name: 'Konfirmasi sudah ditempatkan' }).click();
    await expect(detail.getByRole('button', { name: 'Mulai perawatan' })).toBeEnabled();
    expect((await (await page.request.get(`/api/v1/cycles/${cycle.id}`)).json()).version).toBe(3);
});

test('a failed read after a committed save blocks duplicate writes until detail recovery', async ({ page }) => {
    const { cycle, placement, detail } = await setup(page);
    let reads = 0;
    let writes = 0;
    await page.route(`**/api/v1/cycles/${cycle.id}`, async route => {
        if (route.request().method() === 'PATCH') writes++;
        if (route.request().method() === 'GET' && ++reads === 1)
            return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Baca detail gagal.' } } });
        return route.continue();
    });
    await detail.getByRole('button', { name: 'Ubah penempatan', exact: true }).click();
    await selectOption(detail.getByRole('combobox', { name: /^Penempatan/ }), placement.id);
    await detail.getByRole('button', { name: 'Simpan penempatan' }).click();
    await expect(detail.getByRole('alert')).toContainText('Perubahan tersimpan');
    await expect(detail.getByRole('button', { name: 'Simpan penempatan' })).toBeDisabled();
    await detail.getByRole('button', { name: 'Muat detail terbaru' }).click();
    await expect(detail.getByRole('button', { name: 'Konfirmasi sudah ditempatkan' })).toBeEnabled();
    expect(writes).toBe(1);
});

test('closing detail restores list order, scroll position and keyboard focus', async ({ page }) => {
    await setup(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const rows = await page.locator('tbody tr').allTextContents();
    const opener = page.getByRole('button', { name: 'Lihat detail', exact: true }).last();
    await opener.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => window.scrollY);
    expect(scroll).toBeGreaterThan(0);
    await opener.click();
    await expect(page.getByRole('dialog').getByText('Versi data', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(opener).toBeFocused();
    expect(await page.locator('tbody tr').allTextContents()).toEqual(rows);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll);
});

test('doctor decision keeps detail open with the server result and no nursing actions', async ({ page }) => {
    const { cycle, placement, marker } = await setup(page, true);
    for (const input of [{ placementId: placement.id }, { status: 'assigned' }, { status: 'in_care' }]) {
        const current = await (await page.request.get(`/api/v1/cycles/${cycle.id}`)).json();
        await write(page.request, 'PATCH', `/cycles/${cycle.id}`, { ...input, expectedVersion: current.version });
    }
    await write(page.request, 'POST', `/cycles/${cycle.id}/observations`, {
        symptoms: 'Kondisi sintetis sebelum keputusan dokter.',
        observedAt: new Date().toISOString(),
    });
    await write(page.request, 'POST', `/cycles/${cycle.id}/requests`, { kind: 'release', reason: 'Pengajuan sintetis untuk ditolak dokter.' });
    await signIn(page.request, 'hendra');
    await page.goto('/dashboard?status=pending_approval', { waitUntil: 'networkidle' });
    await page.getByRole('row').filter({ hasText: marker }).getByRole('button', { name: 'Tinjau permintaan' }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.getByRole('button', { name: 'Mulai perawatan' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Ajukan ke dokter' })).toHaveCount(0);
    await expect(detail.getByText('Kondisi sintetis sebelum keputusan dokter.')).toBeVisible();
    await detail.getByLabel('Catatan keputusan').fill('Lanjutkan pemantauan sintetis.');
    await detail.getByRole('button', { name: 'Tolak', exact: true }).click();
    await expect(detail.getByText('Ditolak', { exact: true })).toBeVisible();
    await expect(detail.getByText('Catatan dokter: Lanjutkan pemantauan sintetis.')).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Setujui' })).toHaveCount(0);
});
