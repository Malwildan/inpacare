import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { selectDate } from '../select-date.mjs';

async function signIn(api: APIRequestContext, origin: string, username: string) {
    const response = await api.post('/api/v1/session', {
        headers: { origin },
        data: { username, password: process.env.SEED_DEMO_PASSWORD || 'InpaCareDemo!2026' },
    });
    expect(response.status(), await response.text()).toBe(200);
    return { origin, 'x-csrf-token': (await response.json()).user.csrfToken };
}

function jakartaDay(offset: number) {
    const today = new Date();
    today.setUTCDate(today.getUTCDate() + offset);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', dateStyle: 'short' })
        .format(today);
}

test('coordinator creates a task from cycle detail and keeps the draft after a placement change', async ({ page, request, browser, baseURL }) => {
    test.slow();
    const origin = new URL(baseURL!).origin;
    const suffix = randomUUID().slice(0, 8);
    const replacement = await browser.newPage({ baseURL });
    try {
        const admissions = await signIn(request, origin, 'admisi');
        const patientResponse = await request.post('/api/v1/patients', {
            headers: admissions,
            data: { name: `Pasien tugas ${suffix}`, birthDate: '2000-01-01', gender: 'P', bpjs: false },
        });
        expect(patientResponse.ok(), await patientResponse.text()).toBe(true);
        const patient = await patientResponse.json();
        const coordinator = await signIn(page.request, origin, 'rina');
        const replacer = await signIn(replacement.request, origin, 'bima');
        const rooms = [];
        for (const number of [1, 2]) {
            const room = await page.request.post('/api/v1/rooms', {
                headers: coordinator,
                data: { name: `Ruang tugas ${suffix} ${number}`, roomClass: 'Uji', capacity: 1 },
            });
            expect(room.ok(), await room.text()).toBe(true);
            rooms.push(await room.json());
        }
        const startsOn = jakartaDay(1);
        const endsOn = jakartaDay(3);
        const placementResponse = await page.request.post('/api/v1/placements', {
            headers: coordinator, data: { patientId: patient.id, roomId: rooms[0].id, startsOn, endsOn },
        });
        expect(placementResponse.ok(), await placementResponse.text()).toBe(true);
        const placement = await placementResponse.json();

        const pending = await page.request.post('/api/v1/cycles', {
            headers: coordinator,
            data: { patientId: patient.id, doctorId: 'USR-DOCTOR-1', nurseId: 'USR-COORD', placementId: null },
        });
        expect(pending.status(), await pending.text()).toBe(201);
        const cycle = await pending.json();
        await page.goto(`/dashboard?cycleId=${cycle.id}`);
        const dialog = page.getByRole('dialog');
        const create = dialog.getByRole('button', { name: 'Buat tugas', exact: true });
        await expect(dialog.getByText('Kaitkan penempatan aktif ke rekap sebelum membuat tugas.')).toBeVisible();
        await expect(create).toHaveCount(0);

        const attach = await page.request.patch(`/api/v1/cycles/${cycle.id}`, {
            headers: coordinator, data: { placementId: placement.id, expectedVersion: cycle.version },
        });
        expect(attach.ok(), await attach.text()).toBe(true);
        const current = await (await page.request.get(`/api/v1/cycles/${cycle.id}`)).json();
        const reassign = await page.request.patch(`/api/v1/cycles/${cycle.id}/assignee`, {
            headers: coordinator,
            data: { nurseId: 'USR-NURSE-1', expectedVersion: current.version, reason: 'Penanggung jawab uji' },
        });
        expect(reassign.ok(), await reassign.text()).toBe(true);
        await page.reload();
        await create.click();
        await expect(dialog.getByText(`${patient.name} · ${patient.medicalRecordNo}`)).toBeVisible();
        await expect(dialog.getByText(rooms[0].name, { exact: false })).toBeVisible();
        const pic = dialog.getByRole('combobox', { name: /Perawat penanggung jawab/ });
        await expect(pic).toHaveValue('USR-NURSE-1');
        await pic.selectOption('USR-NURSE-2');

        const title = `Pantau kenyamanan ${suffix}`;
        const titleField = dialog.getByLabel('Judul tugas (wajib)', { exact: true });
        const startsAt = dialog.getByLabel('Waktu mulai (WIB, wajib)', { exact: true });
        const endsAt = dialog.getByLabel('Waktu selesai (WIB, wajib)', { exact: true });
        await titleField.fill(title);
        await selectDate(startsAt, `${startsOn}T08:00`);
        await selectDate(endsAt, `${startsOn}T09:00`);
        await dialog.getByLabel('Deskripsi', { exact: true }).fill('Periksa kenyamanan pasien.');

        const update = await page.request.patch(`/api/v1/placements/${placement.id}`, {
            headers: coordinator,
            data: { patientId: patient.id, roomId: rooms[1].id, startsOn, endsOn, expectedVersion: placement.version, reason: 'Ganti ruangan uji' },
        });
        expect(update.ok(), await update.text()).toBe(true);
        const changed = await update.json();
        const submit = dialog.getByRole('button', { name: 'Simpan tugas', exact: true });
        const stale = page.waitForResponse(response => response.url().endsWith('/api/v1/tasks') && response.request().method() === 'POST');
        await submit.click();
        expect((await stale).status()).toBe(409);
        await expect(dialog.getByRole('alert')).toContainText('Penempatan atau rekap sudah berubah');
        await expect(submit).toBeDisabled();
        await expect(titleField).toHaveValue(title);
        await expect(pic).toHaveValue('USR-NURSE-2');
        await dialog.getByRole('button', { name: 'Muat konteks terbaru' }).click();
        await expect(dialog.getByText(rooms[1].name, { exact: false })).toBeVisible();
        await expect(titleField).toHaveValue(title);
        await expect(pic).toHaveValue('USR-NURSE-2');
        await expect(startsAt).toHaveAttribute('data-value', `${startsOn}T08:00`);
        await expect(endsAt).toHaveAttribute('data-value', `${startsOn}T09:00`);
        await expect(dialog.getByLabel('Deskripsi', { exact: true })).toHaveValue('Periksa kenyamanan pasien.');
        const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/tasks') && response.request().method() === 'POST');
        await submit.click();
        const created = await saved;
        expect(created.status(), await created.text()).toBe(200);
        const task = await created.json();
        expect(task).toMatchObject({
            cycleId: cycle.id, roomId: rooms[1].id, picId: 'USR-NURSE-2', title, status: 'todo',
            startsAt: `${startsOn}T01:00:00.000Z`, endsAt: `${startsOn}T02:00:00.000Z`,
        });
        await expect(dialog.getByRole('link', { name: title, exact: true })).toBeVisible();

        const forbidden = await replacement.request.post('/api/v1/tasks', {
            headers: replacer,
            data: {
                cycleContext: { cycleId: cycle.id, placementVersion: changed.version },
                placementId: placement.id, patientId: patient.id, picId: 'USR-NURSE-2',
                title: 'Tugas tanpa izin', priority: 'normal', startsAt: task.startsAt, endsAt: task.endsAt,
            },
        });
        expect(forbidden.status(), await forbidden.text()).toBe(403);
        await replacement.goto(`/tasks?patientId=${patient.id}`);
        await expect(replacement.getByRole('button', { name: new RegExp(title) })).toBeVisible();
    } finally {
        await replacement.close();
    }
});
