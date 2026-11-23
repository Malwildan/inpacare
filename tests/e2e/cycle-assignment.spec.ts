import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { selectOption } from '../select-option.mjs';

async function signIn(api: APIRequestContext, origin: string, username: string) {
    const response = await api.post('/api/v1/session', {
        headers: { origin },
        data: { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' },
    });
    expect(response.status(), await response.text()).toBe(200);
}

async function write(api: APIRequestContext, origin: string, method: string, path: string, data: unknown) {
    const { cookies } = await api.storageState();
    return api.fetch(`/api/v1${path}`, {
        method,
        data,
        headers: { origin, 'x-csrf-token': cookies.find(cookie => cookie.name === 'csrf_token')!.value },
    });
}

test('coordinator assigns a cycle, monitors the handoff and refreshes after a stale reassignment', async ({ page, request, playwright, baseURL }) => {
    test.setTimeout(60_000);
    const origin = new URL(baseURL!).origin;
    const dina = await playwright.request.newContext({ baseURL });
    const bima = request;
    const marker = randomUUID().slice(0, 8);
    try {
        await signIn(page.request, origin, 'admisi');
        const register = await write(page.request, origin, 'POST', '/patients', {
            name: `Pasien Pengalihan ${marker}`, birthDate: '2000-01-01', gender: 'P', bpjs: false,
        });
        expect(register.status(), await register.text()).toBe(200);
        const patient = await register.json();
        await signIn(page.request, origin, 'rina');
        await signIn(dina, origin, 'dina');
        await signIn(bima, origin, 'bima');

        const newCycle = { patientId: patient.id, doctorId: 'USR-DOCTOR-1' };
        expect((await write(page.request, origin, 'POST', '/cycles', newCycle)).status()).toBe(422);
        expect((await write(page.request, origin, 'POST', '/cycles', { ...newCycle, nurseId: newCycle.doctorId })).status()).toBe(422);
        expect((await write(dina, origin, 'POST', '/cycles', { ...newCycle, nurseId: 'USR-NURSE-2' })).status()).toBe(403);

        const room = await write(page.request, origin, 'POST', '/rooms', {
            name: `Ruang Pengalihan ${marker}`, roomClass: 'Uji', capacity: 1,
        });
        expect(room.ok(), await room.text()).toBe(true);
        const { id: roomId, name: roomName } = await room.json();
        const placed = await write(page.request, origin, 'POST', '/placements', {
            patientId: patient.id, roomId, startsOn: '2037-01-07', endsOn: '2037-01-08',
        });
        expect(placed.ok(), await placed.text()).toBe(true);
        const placement = await placed.json();

        const listUrl = `/dashboard?patientId=${patient.id}&status=assigned`;
        await page.goto(listUrl, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Mulai rawat inap' }).click();
        const dialog = page.getByRole('dialog');
        await selectOption(dialog.getByRole('combobox', { name: 'Pasien terdaftar' }), patient.id);
        await selectOption(dialog.getByRole('combobox', { name: 'Dokter penanggung jawab' }), newCycle.doctorId);
        const nurseField = dialog.getByRole('combobox', { name: 'Perawat penanggung jawab', exact: true });
        await expect(nurseField).toHaveValue('');
        await dialog.getByRole('button', { name: 'Simpan sebagai Menunggu' }).click();
        await expect(dialog.getByRole('alert')).toContainText('Pilih perawat penanggung jawab.');
        await nurseField.selectOption('USR-NURSE-1');
        const savedCreation = page.waitForResponse(response => response.url().endsWith('/api/v1/cycles') && response.request().method() === 'POST');
        await dialog.getByRole('button', { name: 'Simpan dan tempatkan' }).click();
        const saved = await savedCreation;
        expect(saved.status(), await saved.text()).toBe(201);
        const cycle = await saved.json();
        expect(cycle).toMatchObject({ nurseId: 'USR-NURSE-1', placementId: placement.id, status: 'assigned', version: 1 });
        await expect(dialog.getByText('Dina Putri', { exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Mulai perawatan' })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
        const row = page.getByRole('row').filter({ hasText: patient.medicalRecordNo });
        await expect(row).toContainText('Dina Putri');
        await expect(row).toContainText(roomName);
        await expect(row).toContainText('Sudah ditempatkan');

        const path = `/cycles/${cycle.id}`;
        const apiPath = `/api/v1${path}`;
        expect((await dina.get(apiPath)).status()).toBe(200);
        expect((await bima.get(apiPath)).status()).toBe(404);
        expect((await write(bima, origin, 'PATCH', path, { status: 'in_care', expectedVersion: 1 })).status()).toBe(404);
        expect((await write(bima, origin, 'DELETE', path, { reason: 'Uji akses', expectedVersion: 1 })).status()).toBe(404);
        expect((await write(bima, origin, 'POST', `${path}/requests`, { kind: 'release', reason: 'Uji akses' })).status()).toBe(404);
        expect((await write(bima, origin, 'PATCH', `${path}/assignee`, { nurseId: 'USR-NURSE-2', reason: 'Uji akses', expectedVersion: 1 })).status()).toBe(403);

        await row.getByRole('button', { name: 'Lihat detail' }).click();
        await dialog.getByRole('button', { name: 'Alihkan penanggung jawab' }).click();
        const newNurse = dialog.getByRole('combobox', { name: 'Perawat penanggung jawab baru' });
        const reason = dialog.getByLabel('Alasan pengalihan');
        await expect(newNurse).toHaveValue('');
        await newNurse.selectOption('USR-NURSE-2');
        const move = dialog.getByRole('button', { name: 'Alihkan penanggung jawab' });
        await move.click();
        await expect(reason).toBeFocused();
        await reason.fill('Serah terima giliran perawatan');
        await move.click();
        await expect(dialog.getByRole('status')).toHaveText('Perubahan berhasil disimpan.');
        await expect(dialog.getByText('Dina Putri → Bima Pratama')).toBeVisible();
        await expect(dialog.getByText('Rina Saputra', { exact: false })).toBeVisible();
        await expect(dialog.getByText('Serah terima giliran perawatan')).toBeVisible();
        expect(await dialog.locator('time').getAttribute('datetime')).toBeTruthy();
        expect((await dina.get(apiPath)).status()).toBe(404);
        expect((await write(dina, origin, 'PATCH', path, { status: 'in_care', expectedVersion: 2 })).status()).toBe(404);
        expect(await (await bima.get(apiPath)).json()).toMatchObject({ nurseId: 'USR-NURSE-2', version: 2 });
        const filter = `patientId=${patient.id}&status=assigned`;
        expect((await (await dina.get(`/api/v1/cycles/dashboard?${filter}`)).json()).items).toEqual([]);
        expect((await (await bima.get(`/api/v1/cycles/dashboard?${filter}`)).json()).items).toEqual([expect.objectContaining({ id: cycle.id })]);

        await move.click();
        await newNurse.selectOption('USR-NURSE-1');
        await reason.fill('Pengalihan dari versi lama');
        const concurrent = await write(page.request, origin, 'PATCH', `${path}/assignee`, {
            nurseId: 'USR-COORD', expectedVersion: 2, reason: 'Pengalihan yang tersimpan lebih dahulu',
        });
        expect(concurrent.status(), await concurrent.text()).toBe(200);
        await move.click();
        await expect(dialog.getByRole('alert')).toContainText('Data sudah berubah');
        await expect(move).toBeDisabled();
        await dialog.getByRole('button', { name: 'Muat detail terbaru' }).click();
        await expect(dialog.getByRole('status')).toContainText('Detail terbaru dimuat');
        await expect(dialog.getByText('Bima Pratama → Rina Saputra')).toBeVisible();
        const detail = await (await page.request.get(apiPath)).json();
        expect(detail).toMatchObject({ nurseId: 'USR-COORD', version: 3, doctorId: newCycle.doctorId });
        expect(detail.assignmentHistory.map((entry: { reason: string }) => entry.reason)).toEqual([
            'Pengalihan yang tersimpan lebih dahulu', 'Serah terima giliran perawatan',
        ]);
    } finally {
        await dina.dispose();
    }
});
