import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { selectOption } from '../select-option.mjs';

async function signIn(request: APIRequestContext, origin: string, username: string) {
    const response = await request.post('/api/v1/session', {
        headers: { origin },
        data: { username, password: process.env.SEED_DEMO_PASSWORD ?? 'InpaCareDemo!2026' },
    });
    expect(response.status(), await response.text()).toBe(200);
    const { user } = await response.json();
    return { origin, 'x-csrf-token': user.csrfToken };
}

const jakartaDate = (days: number) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + days * 86400000));

async function write(request: APIRequestContext, headers: Record<string, string>, path: string, data: object, status: number) {
    const response = await request.post(`/api/v1${path}`, { headers, data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
}

test('the nurse saves a task observation in its episode and still completes ordinary tasks with notes', async ({ browser, page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const coordinator = await browser.newContext({ baseURL });
    try {
        const tag = randomUUID().slice(0, 8);
        const admissions = await signIn(page.request, origin, 'admisi');
        const patient = await write(page.request, admissions, '/patients', {
            name: `Pasien pengukuran ${tag}`, birthDate: '2000-01-01', gender: 'P', bpjs: false,
        }, 200);
        const nurse = await signIn(page.request, origin, 'dina');
        const manager = await signIn(coordinator.request, origin, 'rina');
        const room = await write(coordinator.request, manager, '/rooms', {
            name: `Ruang pengukuran ${tag}`, roomClass: 'Uji', capacity: 1, dailyRate: '10000',
        }, 200);
        const cycle = await write(page.request, nurse, '/cycles', {
            patientId: patient.id, doctorId: 'USR-DOCTOR-1',
            newPlacement: { roomId: room.id, startsOn: jakartaDate(0), endsOn: jakartaDate(2) },
        }, 201);
        const startCycle = await page.request.patch(`/api/v1/cycles/${cycle.id}`, { headers: nurse, data: { status: 'in_care', expectedVersion: 1 } });
        expect(startCycle.status(), await startCycle.text()).toBe(200);
        const taskInput = {
            patientId: patient.id, placementId: cycle.placementId, picId: 'USR-NURSE-1', priority: 'normal',
            startsAt: `${jakartaDate(1)}T09:00:00+07:00`, endsAt: `${jakartaDate(1)}T10:00:00+07:00`,
        };
        const task = await write(coordinator.request, manager, '/tasks', { ...taskInput, type: 'measurement', title: `Ukur tekanan darah ${tag}` }, 200);
        const regular = await write(coordinator.request, manager, '/tasks', { ...taskInput, title: `Rapikan tempat tidur ${tag}` }, 200);
        expect(task).toMatchObject({ type: 'measurement', cycleId: cycle.id });
        expect(regular).toMatchObject({ type: 'regular', cycleId: null });

        await page.goto(`/tasks?patientId=${patient.id}`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: `Detail ${task.title}`, exact: true }).click();
        await page.getByRole('dialog', { name: task.title }).getByRole('button', { name: 'Mulai', exact: true }).click();
        const form = page.getByRole('dialog', { name: 'Isi hasil observasi' });
        await expect(form).toContainText(patient.name);
        await expect(form).toContainText(room.name);
        await expect(form.getByRole('combobox')).toHaveCount(0);
        await form.getByLabel('Gejala/kondisi').fill('Kondisi stabil');
        await form.getByLabel('Sistolik (mmHg)').fill('120');
        const submit = form.getByRole('button', { name: 'Simpan hasil dan selesaikan tugas' });
        await submit.click();
        await expect(form.getByRole('alert')).toContainText('Tekanan darah belum lengkap');
        await expect(form.getByLabel('Gejala/kondisi')).toHaveValue('Kondisi stabil');
        await expect(form.getByLabel('Sistolik (mmHg)')).toHaveValue('120');

        const taskPath = `/tasks/${task.id}`;
        const completePath = `${taskPath}/complete-measurement`;
        const observationPath = `/api/v1/cycles/${cycle.id}/observations`;
        expect(await (await page.request.get(`/api/v1${taskPath}`)).json()).toMatchObject({ status: 'in_progress', version: 2 });
        expect(await (await page.request.get(observationPath)).json()).toEqual({ items: [] });
        await form.getByLabel('Diastolik (mmHg)').fill('80');
        await write(coordinator.request, manager, completePath, {
            expectedVersion: 2, observedAt: new Date().toISOString(), symptoms: 'Bukan penanggung jawab',
        }, 403);
        const completion = page.waitForResponse(response => response.url().endsWith(completePath) && response.request().method() === 'POST');
        await submit.click();
        const response = await completion;
        expect(response.status(), await response.text()).toBe(200);
        const saved = await response.json();
        expect(saved.task).toMatchObject({ id: task.id, status: 'done', version: 3 });
        const detail = page.getByRole('dialog', { name: task.title });
        await expect(detail.getByText('Selesai', { exact: true })).toBeVisible();

        const retry = await write(page.request, nurse, completePath, response.request().postDataJSON(), 200);
        expect(retry).toEqual(saved);
        expect(await (await page.request.get(observationPath)).json()).toMatchObject({
            items: [{ id: saved.observationId, taskId: task.id, symptoms: 'Kondisi stabil', bloodPressure: '120/80' }],
        });
        const { items: history } = await (await page.request.get(`/api/v1${taskPath}/history`)).json();
        expect(history.filter((entry: { after: { status?: string } }) => entry.after.status === 'done')).toMatchObject([
            { after: { observationId: saved.observationId } },
        ]);

        await detail.getByRole('button', { name: 'Tutup', exact: true }).click();
        await page.getByRole('button', { name: `Detail ${regular.title}`, exact: true }).click();
        const regularDetail = page.getByRole('dialog', { name: regular.title });
        await regularDetail.getByRole('button', { name: 'Tambah catatan' }).click();
        await page.getByLabel('Catatan tindakan').fill('Tempat tidur sudah dirapikan.');
        await page.getByRole('button', { name: 'Simpan catatan' }).click();
        await expect(regularDetail).toContainText('Tempat tidur sudah dirapikan.');
        for (const status of ['in_progress', 'done']) {
            await regularDetail.getByRole('button', { name: 'Pindahkan', exact: true }).click();
            const move = page.getByRole('dialog', { name: `Pindahkan ${regular.title}` });
            await selectOption(move.getByRole('combobox', { name: 'Status tujuan' }), status);
            await move.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
            await expect(move).toHaveCount(0);
            if (status === 'in_progress') await page.getByRole('button', { name: `Detail ${regular.title}`, exact: true }).click();
        }
        expect(await (await page.request.get(`/api/v1/tasks/${regular.id}`)).json()).toMatchObject({
            status: 'done', notes: 'Tempat tidur sudah dirapikan.',
        });
    } finally {
        await coordinator.close();
    }
});
