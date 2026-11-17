import { selectOption } from '../select-option.mjs';
import { selectDate } from '../select-date.mjs';
import { toastMessage } from '../toast.mjs';
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const password = process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026';
async function signIn(page: Page, username: string, origin: string) {
    const response = await page.request.post(`${origin}/api/v1/session`, { headers: { origin }, data: { username, password } });
    expect(response.status()).toBe(200);
    return (await response.json()).user;
}

test('nurse places a patient; coordinator moves, reviews history and cancels with reasons', async ({ browser, page: nurse, request, baseURL }, testInfo) => {
    test.slow();
    const origin = new URL(baseURL!).origin;
    const suffix = randomUUID().slice(0, 8);
    const login = await request.post('/api/v1/session', { headers: { origin }, data: { username: 'admisi', password } });
    expect(login.status()).toBe(200);
    const admissions = await login.json();
    const created = await request.post('/api/v1/patients', { headers: { origin, 'x-csrf-token': admissions.user.csrfToken }, data: { name: `Placement ${suffix}`, birthDate: '2000-01-01', gender: 'L', bpjs: false } });
    expect(created.ok()).toBe(true);
    const patient = await created.json();
    const coordinator = await browser.newPage();
    try {
        const user = await signIn(coordinator, 'rina', origin);
        const headers = { origin, 'x-csrf-token': user.csrfToken };
        const rooms: Array<{ id: string; name: string }> = [];
        for (const number of [1, 2]) {
            const result = await coordinator.request.post('/api/v1/rooms', { headers, data: { name: `Placement ${suffix} ${number}`, roomClass: 'Test', capacity: 1, dailyRate: '0' } });
            expect(result.ok()).toBe(true);
            rooms.push(await result.json());
        }
        await signIn(nurse, 'dina', origin);
        await nurse.goto('/calendar?from=2030-01-01');
        await expect(nurse.getByRole('heading', { name: 'Kalender Ruangan', exact: true })).toBeVisible();
        await expect(nurse.getByRole('heading', { name: 'Kelola penempatan', exact: true })).toHaveCount(0);
        await expect(nurse.getByText('Hubungi koordinator', { exact: false })).toBeVisible();
        await nurse.getByRole('button', { name: 'Tempatkan pasien' }).click();
        const initial = nurse.getByRole('dialog', { name: 'Penempatan pasien', exact: true }).locator('form');
        await selectOption(initial.getByRole('combobox', { name: /^Pasien/ }), patient.id);
        await selectOption(initial.getByRole('combobox', { name: /^Ruangan/ }), rooms[0].id);
        await expect(initial.getByLabel('Tanggal masuk')).toHaveAttribute('data-value', '2030-01-01');
        await selectDate(initial.getByLabel('Tanggal keluar'), '2030-01-05');
        await initial.getByRole('button', { name: 'Simpan penempatan' }).click();
        await expect(toastMessage(nurse, 'Penempatan berhasil', 'success')).toBeVisible();
        await expect(nurse.getByRole('button', { name: 'Ubah penempatan', exact: true })).toHaveCount(0);
        await expect(nurse.getByRole('button', { name: 'Batalkan', exact: true })).toHaveCount(0);
        const occupancy = await (await nurse.request.get('/api/v1/occupancy?from=2030-01-01&to=2030-01-07')).json();
        const placement = occupancy.items.find((item: { patientId: string }) => item.patientId === patient.id);
        const { user: nurseSession } = await (await nurse.request.get('/api/v1/session')).json();
        expect((await nurse.request.delete(`/api/v1/placements/${placement.id}`, { headers: { origin, 'x-csrf-token': nurseSession.csrfToken }, data: { expectedVersion: placement.version, reason: 'Direct nurse attempt' } })).status()).toBe(403);
        await nurse.setViewportSize({ width: 390, height: 844 });
        await nurse.screenshot({ path: testInfo.outputPath('nurse-mobile.png'), fullPage: true });

        await coordinator.goto('/calendar?from=2030-01-01');
        const row = coordinator.locator('.placement-list tbody > tr').filter({ hasText: patient.name });
        await row.getByRole('button', { name: 'Ubah penempatan' }).click();
        const editor = coordinator.getByRole('dialog', { name: 'Ubah penempatan', exact: true }).locator('form');
        await selectOption(editor.getByRole('combobox', { name: /^Ruangan/ }), rooms[1].id);
        await editor.getByLabel('Alasan perubahan').fill('Transfer to available room');
        // A conflict keeps the entered room and reason so the coordinator can recover.
        await coordinator.route(`**/api/v1/placements/${placement.id}`, async route => {
            if (route.request().method() === 'PATCH') await route.fulfill({ status: 409, json: { error: { code: 'CONFLICT', message: 'Data penempatan telah berubah.' } } });
            else await route.continue();
        });
        await editor.getByRole('button', { name: 'Simpan penempatan' }).click();
        await expect(toastMessage(coordinator, 'Data penempatan telah berubah.')).toBeVisible();
        await expect(editor.getByLabel('Alasan perubahan')).toHaveValue('Transfer to available room');
        await expect(editor.getByRole('combobox', { name: /^Ruangan/ })).toHaveAttribute('data-value', rooms[1].id);
        await coordinator.unroute(`**/api/v1/placements/${placement.id}`);
        await coordinator.screenshot({ path: testInfo.outputPath('coordinator-editor.png'), fullPage: true });
        await editor.getByRole('button', { name: 'Simpan penempatan' }).click();
        await expect(toastMessage(coordinator, 'Perubahan penempatan berhasil', 'success')).toBeVisible();
        await expect(row).toContainText(rooms[1].name);
        await row.getByRole('button', { name: 'Riwayat', exact: true }).click();
        const history = coordinator.getByRole('dialog', { name: 'Riwayat penempatan', exact: true });
        await expect(history).toContainText('Transfer to available room');
        await expect(history).toContainText('Rina Saputra');
        await expect(history).toContainText(rooms[0].name);
        await expect(history).toContainText(rooms[1].name);
        await history.getByRole('button', { name: 'Tutup riwayat' }).click();
        await coordinator.reload();
        await row.getByRole('button', { name: 'Riwayat', exact: true }).click();
        await expect(history).toContainText('Transfer to available room');
        await history.getByRole('button', { name: 'Tutup riwayat' }).click();
        await row.getByRole('button', { name: 'Batalkan', exact: true }).click();
        const cancellation = coordinator.getByRole('alertdialog', { name: 'Batalkan penempatan?', exact: true });
        await cancellation.getByLabel('Alasan pembatalan').fill('Admission cancelled');
        await cancellation.getByRole('button', { name: 'Konfirmasi pembatalan' }).click();
        await expect(history).toContainText('Admission cancelled');
        await expect(history).toContainText('Dibatalkan');
        await expect(row).toContainText('Dibatalkan');
        await expect(coordinator.locator('.calendar .booking').filter({ hasText: patient.name })).toHaveCount(0);
        await coordinator.setViewportSize({ width: 390, height: 844 });
        await coordinator.screenshot({ path: testInfo.outputPath('coordinator-history-mobile.png'), fullPage: true });
        await history.getByRole('button', { name: 'Tutup riwayat' }).click();
        await coordinator.reload();
        await row.getByRole('button', { name: 'Riwayat', exact: true }).click();
        await expect(history).toContainText('Admission cancelled');
        await expect(row.getByRole('button', { name: 'Ubah penempatan' })).toBeDisabled();
        const response = await coordinator.request.get(`/api/v1/placements/${placement.id}/history`);
        expect((await response.json()).items).toHaveLength(2);
    } finally {
        await coordinator.close();
    }
});
