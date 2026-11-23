import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

test.setTimeout(60_000);

async function signIn(api: APIRequestContext, username: string) {
    const response = await api.post('/api/v1/session', {
        headers: { origin: test.info().project.use.baseURL! },
        data: { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' },
    });
    expect(response.status()).toBe(200);
}

async function write(api: APIRequestContext, path: string, data: unknown, method = 'POST') {
    const { cookies } = await api.storageState();
    const response = await api.fetch(`/api/v1${path}`, {
        method,
        headers: {
            origin: test.info().project.use.baseURL!,
            'x-csrf-token': cookies.find(cookie => cookie.name === 'csrf_token')!.value,
        },
        data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
}

async function createCycle(page: Page, withPlacement = false) {
    const name = `Pasien notifikasi ${randomUUID().slice(0, 8)}`;
    await signIn(page.request, 'admisi');
    const patient = await write(page.request, '/patients', { name, birthDate: '2000-01-01', gender: 'P', bpjs: false });
    await signIn(page.request, withPlacement ? 'rina' : 'dina');
    const cycle = await write(page.request, '/cycles', {
        patientId: patient.id,
        doctorId: 'USR-DOCTOR-1',
        ...(withPlacement ? {
            nurseId: 'USR-COORD',
            newPlacement: { roomId: 'RG-004', startsOn: '2066-01-01', endsOn: '2066-01-02' },
        } : {}),
    });
    return { name, id: cycle.id as string };
}

function bell(page: Page) {
    return page.getByRole('button', { name: 'Notifikasi', exact: true });
}

const unavailable = 'Tujuan ini tidak tersedia untuk akun Anda. Kembali untuk melihat data yang dapat Anda buka.';

test('keyboard activation opens the exact request and retries a failed read without losing the message', async ({ page, playwright }) => {
    const { name, id } = await createCycle(page, true);
    await write(page.request, `/cycles/${id}`, { status: 'in_care', expectedVersion: 1 }, 'PATCH');
    const doctor = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    try {
        await signIn(doctor, 'hendra');
        const first = await write(page.request, `/cycles/${id}/requests`, { kind: 'release', reason: 'Alasan permintaan pertama' });
        const decide = (requestId: string, expectedVersion: number, note: string) =>
            write(doctor, `/cycles/${id}/requests/${requestId}/decision`, { decision: 'reject', note, expectedVersion });
        await decide(first.id, 2, 'Catatan untuk permintaan pertama');
        const second = await write(page.request, `/cycles/${id}/requests`, {
            kind: 'extend', requestedEnd: '2066-01-03', reason: 'Alasan permintaan kedua'
        });
        await decide(second.id, 3, 'Catatan untuk permintaan kedua');

        const notices = async () => (await (await page.request.get('/api/v1/notifications')).json()).items;
        const readAt = async () => (await notices()).find((item: { requestId: string }) => item.requestId === first.id)?.readAt;
        const notice = (await notices()).find((item: { requestId: string }) => item.requestId === first.id);
        expect(notice).toMatchObject({ cycleId: id, requestId: first.id, readAt: null });
        await page.route(`**/api/v1/notifications/${notice.id}/read`, route => route.fulfill({
            status: 500, json: { error: { code: 'FAILED', message: 'Gagal menyimpan.' } },
        }), { times: 1 });

        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await bell(page).click();
        const item = page.getByRole('button', { name: /Permintaan pelepasan ditolak.*Belum dibaca/ });
        await item.press('Enter');
        await expect(page.getByText(/status baca notifikasi/i)).toBeVisible();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(item).toBeVisible();
        expect(await readAt()).toBeNull();

        await item.press('Space');
        await expect(page).toHaveURL(`/dashboard?cycleId=${id}&requestId=${first.id}`);
        const detail = page.getByRole('dialog', { name: 'Detail rekap rawat inap' });
        await expect(detail.getByText(name, { exact: true })).toBeVisible();
        const request = detail.getByRole('group', { name: 'Permintaan dari notifikasi' });
        await expect(request).toContainText('Catatan untuk permintaan pertama');
        await expect(request).toBeFocused();
        expect(await readAt()).toBeTruthy();

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(request).toContainText('Alasan permintaan pertama');
        const missingRequest = await page.goto(`/dashboard?cycleId=${id}&requestId=${randomUUID()}`, { waitUntil: 'domcontentloaded' });
        expect(missingRequest?.status()).toBe(404);
        await expect(page.getByText(unavailable)).toBeVisible();
        await expect(page.getByText('Alasan permintaan pertama')).toHaveCount(0);
        await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    } finally {
        await doctor.dispose();
    }
});

test.describe('touch notifications', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('opens cycle-only notices and still marks legacy messages read in the full inbox', async ({ page }) => {
        const { name, id } = await createCycle(page);
        const readIds: string[] = [];
        await page.route('**/api/v1/notifications', route => route.fulfill({ json: {
            items: [
                { id: 'legacy', cycleId: null, message: 'Notifikasi lama', readAt: null, createdAt: '2026-01-01T00:00:00Z' },
                { id: 'cycle-only', cycleId: id, message: 'Notifikasi rekap', readAt: null, createdAt: '2026-01-01T00:00:00Z' },
            ],
        } }));
        await page.route('**/api/v1/notifications/*/read', route => {
            readIds.push(new URL(route.request().url()).pathname.split('/').at(-2)!);
            return route.fulfill({ json: { ok: true } });
        });

        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Lihat notifikasi', exact: true }).tap();
        const inbox = page.getByRole('dialog', { name: 'Semua notifikasi' });
        await inbox.getByRole('button', { name: 'Tandai dibaca' }).tap();
        const legacy = inbox.getByRole('listitem').filter({ hasText: 'Notifikasi lama' });
        await expect(legacy).toContainText('Sudah dibaca');
        await expect(page).toHaveURL(/\/dashboard$/);
        await inbox.getByRole('button', { name: 'Buka rekap' }).tap();
        await expect(inbox).toHaveCount(0);
        await expect(page).toHaveURL(`/dashboard?cycleId=${id}`);
        await expect(page.getByRole('dialog', { name: 'Detail rekap rawat inap' }).getByText(name, { exact: true })).toBeVisible();
        expect(readIds).toEqual(['legacy', 'cycle-only']);
        await page.getByRole('button', { name: 'Tutup', exact: true }).tap();
        await expect(page).toHaveURL(/\/dashboard$/);
    });
});

test('another ordinary nurse cannot open the direct URL, and a deleted target has a safe return link', async ({ page, playwright }) => {
    const { name, id } = await createCycle(page);
    const target = `/dashboard?cycleId=${id}`;
    const otherNurse = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    try {
        await signIn(otherNurse, 'bima');
        const apiResponse = await otherNurse.get(`/api/v1/cycles/${id}`);
        expect(apiResponse.status()).toBe(404);
        const response = await otherNurse.get(target);
        expect(response.status()).toBe(404);
        const html = await response.text();
        expect(html).toContain(unavailable);
        expect(html).not.toContain(name);
    } finally {
        await otherNurse.dispose();
    }

    await write(page.request, `/cycles/${id}`, { expectedVersion: 1, reason: 'Uji tujuan lama' }, 'DELETE');
    await page.route('**/api/v1/notifications', route => route.fulfill({ json: {
        items: [{ id: 'stale', cycleId: id, message: 'Notifikasi dengan tujuan lama', readAt: '2026-01-02T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }],
    } }));
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await bell(page).click();
    await page.getByRole('button', { name: /Notifikasi dengan tujuan lama/ }).click();
    await expect(page).toHaveURL(target);
    await expect(page.getByText(unavailable)).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
    await page.getByRole('link', { name: 'Kembali ke halaman utama' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
});
