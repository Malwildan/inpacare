import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { selectOption } from '../select-option.mjs';
import { selectDate } from '../select-date.mjs';

const password = process.env.SEED_DEMO_PASSWORD ?? 'InpaCareDemo!2026';
const evidence = path.resolve('.local/evidence');
const clients: Record<string, { http: APIRequestContext; csrf: string }> = {};
let doctorId: string;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

test.beforeAll(async ({ playwright, baseURL }) => {
    for (const username of ['admisi', 'rina', 'dina', 'hendra']) {
        const http = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
        const response = await http.post('/api/v1/session', { data: { username, password } });
        expect(response.status()).toBe(200);
        clients[username] = { http, csrf: (await response.json()).user.csrfToken };
    }
    const reference = await (await clients.dina.http.get('/api/v1/reference')).json();
    doctorId = reference.staff.find((item: { role: string; active: boolean }) => item.role === 'DOKTER' && item.active).id;
    await mkdir(evidence, { recursive: true });
});

test.afterAll(async () => { for (const client of Object.values(clients)) await client.http.dispose(); });

async function post(username: string, route: string, data: unknown, status = 201) {
    const client = clients[username];
    const response = await client.http.post(`/api/v1${route}`, { data, headers: { 'x-csrf-token': client.csrf } });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
}

async function patient(label: string) {
    return post('admisi', '/patients', { name: `Uji #60 ${label} ${randomUUID().slice(0, 8)}`, birthDate: '1990-01-01', gender: 'P', bpjs: false }, 200);
}

async function room() {
    return post('rina', '/rooms', { name: `Ruang uji #60 ${randomUUID().slice(0, 8)}`, roomClass: 'Uji', capacity: 1, dailyRate: '0' }, 200);
}

async function openAdmission(page: Page) {
    await page.goto('/login');
    await page.getByLabel('ID petugas').fill('dina');
    await page.getByLabel('Kata sandi', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Mulai rawat inap', exact: true }).click();
    return page.getByRole('dialog', { name: 'Mulai rawat inap', exact: true });
}

test('new placement survives a lost response, safely retries, opens details, and explicitly starts care', async ({ page }) => {
    const person = await patient('baru');
    const assignedRoom = await room();
    const form = await openAdmission(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await selectOption(form.getByRole('combobox', { name: 'Pasien terdaftar', exact: true }), person.id);
    await selectOption(form.getByRole('combobox', { name: 'Dokter penanggung jawab', exact: true }), doctorId);
    await selectOption(form.getByRole('combobox', { name: 'Ruangan', exact: true }), assignedRoom.id);
    await selectDate(form.getByRole('button', { name: 'Tanggal masuk', exact: true }), day(0));
    await selectDate(form.getByRole('button', { name: 'Tanggal selesai', exact: true }), day(2));
    const attempts: Record<string, unknown>[] = [];
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/cycles', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        attempts.push(route.request().postDataJSON());
        if (attempts.length === 1) {
            const saved = await route.fetch();
            expect(saved.status()).toBe(201);
            await held;
            await route.abort('failed');
        } else await route.continue();
    });
    await form.getByRole('button', { name: 'Simpan dan tempatkan', exact: true }).click();
    await expect.poll(() => attempts.length).toBe(1);
    await expect(form.getByRole('button', { name: 'Menyimpan…', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    release();
    await expect(form.getByRole('alert')).toContainText('Rekap belum dapat dipastikan tersimpan. Periksa daftar rekap terbaru. Jika perlu mencoba lagi, kirim isian yang sama.');
    await expect(form.getByRole('combobox', { name: 'Pasien terdaftar', exact: true })).toHaveAttribute('data-value', person.id);
    await expect(form.getByRole('combobox', { name: 'Dokter penanggung jawab', exact: true })).toHaveAttribute('data-value', doctorId);
    await expect(form.getByRole('combobox', { name: 'Ruangan', exact: true })).toHaveAttribute('data-value', assignedRoom.id);
    await expect(form.getByRole('button', { name: 'Tanggal masuk', exact: true })).toHaveAttribute('data-value', day(0));
    await expect(form.getByRole('button', { name: 'Tanggal selesai', exact: true })).toHaveAttribute('data-value', day(2));
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await form.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: path.join(evidence, `issue-60-admission-${width}.png`), animations: 'disabled', style: '[data-sonner-toaster] { visibility: hidden; }' });
    }
    await form.getByRole('button', { name: 'Simpan dan tempatkan', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Detail rekap rawat inap', exact: true });
    await expect(detail).toContainText(person.name);
    await expect(detail).toContainText('Sudah ditempatkan');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    const context = await (await clients.dina.http.get(`/api/v1/patients/${person.id}/context`)).json();
    expect(context.placements).toHaveLength(1);
    expect(context.cycles).toHaveLength(1);
    const cycleId = context.cycles[0].id;
    const start = detail.getByRole('button', { name: 'Mulai perawatan', exact: true });
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(detail).toContainText('Dalam perawatan');
    const saved = await (await clients.dina.http.get(`/api/v1/cycles/${cycleId}`)).json();
    expect(saved).toMatchObject({ status: 'in_care', version: 2, placementId: context.placements[0].id });
    const replay = await post('dina', '/cycles', attempts[0]);
    expect(replay).toMatchObject({ id: cycleId, status: 'assigned', version: 1 });
    expect((await (await clients.dina.http.get(`/api/v1/cycles/${cycleId}`)).json()).status).toBe('in_care');
    expect(errors).toEqual([]);
});

test('only the selected patient placements are offered, auto-selection is visible, and switching patients resets it', async ({ page }) => {
    const single = await patient('penempatan tunggal');
    const multiple = await patient('dua penempatan');
    const assignedRoom = await room();
    const placement = await post('dina', '/placements', { patientId: single.id, roomId: assignedRoom.id, startsOn: day(5), endsOn: day(6) });
    const first = await post('dina', '/placements', { patientId: multiple.id, roomId: assignedRoom.id, startsOn: day(10), endsOn: day(11) });
    const second = await post('dina', '/placements', { patientId: multiple.id, roomId: assignedRoom.id, startsOn: day(15), endsOn: day(16) });
    const form = await openAdmission(page);
    const patientPicker = form.getByRole('combobox', { name: 'Pasien terdaftar', exact: true });
    await selectOption(patientPicker, single.id);
    await expect(form.getByRole('combobox', { name: 'Cara penempatan', exact: true })).toHaveAttribute('data-value', 'existing');
    const placementPicker = form.getByRole('combobox', { name: 'Penempatan pasien', exact: true });
    await expect(placementPicker).toHaveAttribute('data-value', placement.id);
    await expect(placementPicker).toContainText(assignedRoom.name);
    await placementPicker.click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await expect(page.locator(`[role="option"][data-value="${first.id}"]`)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await selectOption(patientPicker, multiple.id);
    await expect(placementPicker).toHaveAttribute('data-value', '');
    await selectOption(placementPicker, second.id);
    await selectOption(patientPicker, single.id);
    await expect(placementPicker).toHaveAttribute('data-value', placement.id);
    await selectOption(form.getByRole('combobox', { name: 'Dokter penanggung jawab', exact: true }), doctorId);
    await form.getByRole('button', { name: 'Simpan dan tempatkan', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Detail rekap rawat inap', exact: true });
    await expect(detail).toContainText(single.name);
    await expect(detail).toContainText('Sudah ditempatkan');
    const context = await (await clients.dina.http.get(`/api/v1/patients/${single.id}/context`)).json();
    expect(context.placements).toHaveLength(1);
    expect(context.cycles).toHaveLength(1);
    const cycle = await (await clients.dina.http.get(`/api/v1/cycles/${context.cycles[0].id}`)).json();
    expect(cycle.placementId).toBe(placement.id);
});

test('waiting can be saved without a room and doctors and admissions cannot create an admission', async ({ page }) => {
    const person = await patient('menunggu');
    const input = { patientId: person.id, doctorId, requestId: randomUUID() };
    for (const username of ['admisi', 'hendra']) await post(username, '/cycles', input, 403);
    const form = await openAdmission(page);
    await selectOption(form.getByRole('combobox', { name: 'Pasien terdaftar', exact: true }), person.id);
    await selectOption(form.getByRole('combobox', { name: 'Dokter penanggung jawab', exact: true }), doctorId);
    await form.getByRole('button', { name: 'Simpan sebagai Menunggu', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Detail rekap rawat inap', exact: true });
    await expect(detail).toContainText(person.name);
    await expect(detail).toContainText('Belum ditempatkan');
    await expect(detail.getByRole('button', { name: 'Mulai perawatan', exact: true })).toHaveCount(0);
    const context = await (await clients.dina.http.get(`/api/v1/patients/${person.id}/context`)).json();
    expect(context.placements).toHaveLength(0);
    expect(context.cycles).toHaveLength(1);
    expect(context.cycles[0].status).toBe('pending');
});
