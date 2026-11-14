import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const password = 'InpaCareDemo!2026';
const evidence = path.resolve('.local/evidence');
const origin = 'http://127.0.0.1:18088';
const coordinator = 'USR-COORD';
const dina = 'USR-NURSE-1';
const bima = 'USR-NURSE-2';

test.describe.configure({ timeout: 90_000 });

type Reference = {
	staff: { id: string; name: string; role: string; active: boolean }[];
	placements: { id: string; patientId: string; patientName: string; roomName: string; status: string }[];
};
type Task = { id: string; title: string; status: string; version: number; picId: string };

let sequence = 0;
function unique(label: string) {
	return `${label} ${Date.now()}-${++sequence}`;
}
function escape(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function signIn(page: Page, username: string) {
	await page.goto('/login');
	await page.getByLabel('ID petugas').fill(username);
	await page.getByLabel('Kata sandi', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).not.toHaveURL(/\/login$/);
}

async function api<T = unknown>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
	const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf_token')?.value ?? '';
	const response = await page.request.fetch(`/api/v1${path}`, {
		method,
		headers: { 'x-csrf-token': csrf, origin },
		data: body as Record<string, unknown> | undefined
	});
	const text = await response.text();
	if (!response.ok()) throw new Error(`${method} ${path} -> ${response.status()}: ${text}`);
	return (text ? JSON.parse(text) : undefined) as T;
}

async function reference(page: Page) {
	return api<Reference>(page, 'GET', '/reference');
}

async function createTask(page: Page, ref: Reference, title: string, picId = dina, priority = 'normal') {
	const placement = ref.placements.find(item => item.status === 'active')!;
	const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
	const endsAt = new Date(Date.now() + 90 * 60_000).toISOString();
	return api<Task>(page, 'POST', '/tasks', {
		patientId: placement.patientId,
		placementId: placement.id,
		picId,
		title,
		priority,
		startsAt,
		endsAt
	});
}

async function moveApi(page: Page, task: Task, status: string, beforeTaskId: string | null = null, reason?: string) {
	return api<Task>(page, 'POST', `/tasks/${task.id}/move`, {
		expectedVersion: task.version,
		status,
		beforeTaskId,
		...(reason ? { reason } : {})
	});
}

function column(page: Page, label: string) {
	return page.locator(`.task-column[aria-label="${label}"]`);
}
function card(page: Page, title: string) {
	return page.locator('.task-card').filter({ hasText: title });
}
function openButton(page: Page, title: string) {
	return card(page, title).getByRole('button', { name: new RegExp(escape(title)) });
}
async function openDetails(page: Page, title: string) {
	await openButton(page, title).click();
	await expect(page.getByRole('dialog')).toContainText(title);
}

async function headingCounts(page: Page, label: string) {
	const text = await column(page, label).locator('.column-heading > span').innerText();
	const [loaded, total] = text.split('/').map(value => Number(value.trim()));
	return { loaded, total };
}

async function titles(page: Page, label: string, prefix: string) {
	const all = await column(page, label).locator('.card-title').allTextContents();
	return all.filter(title => title.startsWith(prefix));
}

async function moveVia(page: Page, title: string, statusLabel: string, options: { before?: string; reason?: string } = {}) {
	await card(page, title).getByRole('button', { name: 'Pindahkan' }).click();
	const dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(title)}`) });
	await dialog.getByLabel('Status tujuan').selectOption({ label: statusLabel });
	if (options.before) await dialog.getByLabel('Posisi').selectOption({ label: `Sebelum ${options.before}` });
	if (options.reason) await dialog.getByLabel('Alasan pembatalan').fill(options.reason);
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	return dialog;
}

test('a filtered card stays pending and a filter change receives the committed move', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const title = unique('Navigasi tertunda');
	await createTask(page, ref, title);
	await page.goto(`/tasks?search=${encodeURIComponent(title)}&status=todo`);
	let release!: () => void;
	const gate = new Promise<void>(resolve => (release = resolve));
	await page.route('**/api/v1/tasks/*/move', async route => { await gate; await route.continue(); });
	try {
		await moveVia(page, title, 'Sedang Dikerjakan');
		await expect(column(page, 'Belum Dikerjakan').locator('.task-card').filter({ hasText: title })).toBeVisible();
		await expect(card(page, title).getByRole('status')).toContainText('Menyimpan');
		await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();
		await page.getByRole('button', { name: 'status: todo - Hapus' }).click();
		await expect(page).not.toHaveURL(/status=todo/);
		await expect(column(page, 'Belum Dikerjakan').locator('.task-card').filter({ hasText: title })).toBeVisible();
		release();
		await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: title })).toBeVisible();
		await expect(column(page, 'Belum Dikerjakan').locator('.task-card').filter({ hasText: title })).toHaveCount(0);
		await expect(page.locator('p.success')).toContainText('dipindahkan ke Sedang Dikerjakan');
		expect(await headingCounts(page, 'Sedang Dikerjakan')).toEqual({ loaded: 1, total: 1 });
	} finally { release(); await page.close(); }
});

test('retry after a rejected move and failed refresh replaces stale cards', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const title = unique('Pulihkan daftar');
	const task = await createTask(page, ref, title);
	await page.goto(`/tasks?search=${encodeURIComponent(title)}`);
	await expect(card(page, title)).toBeVisible();
	await moveApi(page, task, 'in_progress');
	await page.route('**/api/v1/tasks?**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Daftar gagal dimuat.' } }) }));
	const dialog = await moveVia(page, title, 'Sedang Dikerjakan');
	await expect(dialog.locator('p.error')).toContainText('Tugas berubah');
	await dialog.getByRole('button', { name: 'Batal' }).click();
	await expect(column(page, 'Belum Dikerjakan').getByRole('alert')).toBeVisible();
	await page.unroute('**/api/v1/tasks?**');
	await column(page, 'Belum Dikerjakan').getByRole('button', { name: 'Coba lagi' }).click();
	await expect(column(page, 'Belum Dikerjakan').locator('.task-card')).toHaveCount(0);
	await column(page, 'Sedang Dikerjakan').getByRole('button', { name: 'Coba lagi' }).click();
	await expect(column(page, 'Sedang Dikerjakan').locator('.task-card')).toContainText(title);
	await moveVia(page, title, 'Selesai');
	await expect(page.locator('p.success')).toContainText('dipindahkan ke Selesai');
	await page.close();
});

test('a delayed pagination response cannot restore a moved card', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const prefix = unique('Halaman tertunda');
	for (let i = 0; i < 51; i++) await createTask(page, ref, `${prefix} ${i}`);
	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const title = await column(page, 'Belum Dikerjakan').locator('.card-title').first().innerText();
	let release!: () => void;
	let captured!: () => void;
	const gate = new Promise<void>(resolve => (release = resolve));
	const ready = new Promise<void>(resolve => (captured = resolve));
	await page.route(/\/api\/v1\/tasks\?.*status=todo.*offset=50/, async route => {
		const response = await route.fetch();
		captured();
		await gate;
		await route.fulfill({ response });
	});
	try {
		await column(page, 'Belum Dikerjakan').getByRole('button', { name: 'Muat lebih banyak' }).click();
		await ready;
		await moveVia(page, title, 'Sedang Dikerjakan');
		await expect(page.locator('p.success')).toContainText('dipindahkan ke Sedang Dikerjakan');
		const paginationResponse = page.waitForResponse(response => response.url().includes('offset=50'));
		release();
		await paginationResponse;
		await expect(column(page, 'Belum Dikerjakan').locator('.task-card').filter({ hasText: title })).toHaveCount(0);
		expect(await headingCounts(page, 'Belum Dikerjakan')).toEqual({ loaded: 50, total: 50 });
		await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: title })).toBeVisible();
	} finally { release(); await page.close(); }
});

test('a cancelled task can be reordered without a new cancellation reason', async ({ browser }) => {
	const author = await browser.newPage();
	await signIn(author, 'rina');
	const ref = await reference(author);
	const prefix = unique('Batal urut');
	const first = await createTask(author, ref, `${prefix} A`);
	const second = await createTask(author, ref, `${prefix} B`);
	const existing = await api<{ items: Task[] }>(author, 'GET', '/tasks?status=cancelled&order=board&limit=1');
	const anchor = existing.items[0]?.id ?? null;
	await moveApi(author, first, 'cancelled', anchor, 'Tidak diperlukan');
	await moveApi(author, second, 'cancelled', anchor, 'Tidak diperlukan');
	const pic = await browser.newPage();
	await signIn(pic, 'dina');
	await pic.goto('/tasks');
	const dialog = await moveVia(pic, second.title, 'Dibatalkan', { before: first.title });
	await expect(dialog).toHaveCount(0);
	await pic.reload();
	expect(await titles(pic, 'Dibatalkan', prefix)).toEqual([second.title, first.title]);
	const saved = await api<Task>(pic, 'GET', `/tasks/${second.id}`);
	expect(saved.status).toBe('cancelled');
	expect(saved.version).toBe(3);
	await pic.close();
	await author.close();
});

test('pointer drag saves status and same-list order across reload and a second session', async ({ browser }) => {
	const author = await browser.newPage();
	await signIn(author, 'rina');
	const ref = await reference(author);
	const prefix = unique('Tarik');
	const titlesSeeded = [unique(`${prefix} A`), unique(`${prefix} B`), unique(`${prefix} C`)];
	const [a, b, c] = [await createTask(author, ref, titlesSeeded[0]), await createTask(author, ref, titlesSeeded[1]), await createTask(author, ref, titlesSeeded[2])];
	const firstInProgress = await api<{ items: Task[] }>(author, 'GET', '/tasks?status=in_progress&order=board&limit=1');
	const anchor = firstInProgress.items[0]?.id ?? null;
	const insertion = [a, b, c];
	const inProgressTasks: Task[] = [];
	for (const task of insertion) inProgressTasks.push(await moveApi(author, task, 'in_progress', anchor));
	expect(inProgressTasks.map(task => task.status)).toEqual(['in_progress', 'in_progress', 'in_progress']);

	const pic = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	await signIn(pic, 'dina');
	await pic.goto('/tasks');
	await expect(pic.locator('.task-board')).toBeVisible();
	expect(await titles(pic, 'Sedang Dikerjakan', prefix)).toEqual(titlesSeeded);

	await card(pic, titlesSeeded[2]).dragTo(card(pic, titlesSeeded[0]));
	await expect.poll(() => titles(pic, 'Sedang Dikerjakan', prefix)).toEqual([titlesSeeded[2], titlesSeeded[0], titlesSeeded[1]]);
	await expect(pic.getByRole('dialog')).toHaveCount(0);

	await card(pic, titlesSeeded[1]).dragTo(column(pic, 'Selesai').locator('.column-heading'));
	await expect(pic.locator('p.success')).toContainText(`${titlesSeeded[1]} dipindahkan ke Selesai.`);
	const done = await api<{ items: Task[]; total: number }>(pic, 'GET', '/tasks?status=done&order=board&limit=1');
	const lastDone = await api<{ items: Task[] }>(pic, 'GET', `/tasks?status=done&order=board&limit=1&offset=${done.total - 1}`);
	expect(lastDone.items.map(task => [task.id, task.status])).toEqual([[b.id, 'done']]);
	while ((await headingCounts(pic, 'Selesai')).loaded < done.total) {
		const loaded = (await headingCounts(pic, 'Selesai')).loaded;
		await column(pic, 'Selesai').getByRole('button', { name: 'Muat lebih banyak' }).click();
		await expect.poll(async () => (await headingCounts(pic, 'Selesai')).loaded).toBeGreaterThan(loaded);
	}
	await expect(column(pic, 'Selesai').locator('.task-card').filter({ hasText: titlesSeeded[1] })).toBeVisible();
	await expect(pic.getByRole('dialog')).toHaveCount(0);

	await pic.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	await expect(pic.locator('.task-board')).toBeVisible();
	await expect.poll(() => titles(pic, 'Sedang Dikerjakan', prefix)).toEqual([titlesSeeded[2], titlesSeeded[0]]);
	await expect(column(pic, 'Selesai').locator('.task-card').filter({ hasText: titlesSeeded[1] })).toBeVisible();

	const second = await browser.newPage();
	await signIn(second, 'rina');
	await second.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	await expect.poll(() => titles(second, 'Sedang Dikerjakan', prefix)).toEqual([titlesSeeded[2], titlesSeeded[0]]);
	await expect(column(second, 'Selesai').locator('.task-card').filter({ hasText: titlesSeeded[1] })).toBeVisible();

	await pic.close();
	await second.close();
	await author.close();
});

test('allowed transitions and terminal restrictions hold for PIC and coordinator', async ({ browser }) => {
	const coordinatorPage = await browser.newPage();
	await signIn(coordinatorPage, 'rina');
	const ref = await reference(coordinatorPage);
	const prefix = unique('Alur');
	const mine = unique(`${prefix} PIC`);
	const other = unique(`${prefix} Lain`);
	await createTask(coordinatorPage, ref, mine, dina);
	const others = await createTask(coordinatorPage, ref, other, bima);

	const dinaPage = await browser.newPage();
	await signIn(dinaPage, 'dina');
	await dinaPage.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const mineCard = card(dinaPage, mine);
	await expect(mineCard).toBeVisible();
	await mineCard.getByRole('button', { name: 'Pindahkan' }).click();
	let dialog = dinaPage.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(mine)}`) });
	expect(await dialog.getByLabel('Status tujuan').locator('option').allTextContents()).toEqual(['Sedang Dikerjakan']);
	await dialog.getByLabel('Status tujuan').selectOption({ label: 'Sedang Dikerjakan' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(dinaPage.locator('p.success')).toContainText(/dipindahkan/i);
	await expect(column(dinaPage, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: mine })).toBeVisible();

	await card(dinaPage, mine).getByRole('button', { name: 'Pindahkan' }).click();
	dialog = dinaPage.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(mine)}`) });
	expect(await dialog.getByLabel('Status tujuan').locator('option').allTextContents()).toEqual(['Selesai']);
	await dialog.getByLabel('Status tujuan').selectOption({ label: 'Selesai' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(column(dinaPage, 'Selesai').locator('.task-card').filter({ hasText: mine })).toBeVisible();
	await expect(card(dinaPage, mine).getByRole('button', { name: 'Pindahkan' })).toHaveCount(0);
	await openDetails(dinaPage, mine);
	await expect(dinaPage.getByRole('dialog').getByRole('button', { name: 'Pindahkan' })).toHaveCount(0);
	await dinaPage.getByRole('button', { name: 'Tutup' }).click();

	await coordinatorPage.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	await expect(column(coordinatorPage, 'Belum Dikerjakan').locator('.task-card').filter({ hasText: other })).toBeVisible();
	await moveVia(coordinatorPage, other, 'Sedang Dikerjakan');
	await expect(column(coordinatorPage, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: other })).toBeVisible();

	const apiOther = await api<Task>(coordinatorPage, 'GET', `/tasks/${others.id}`);
	expect(apiOther.status).toBe('in_progress');
	expect(apiOther.picId).toBe(bima);

	await coordinatorPage.close();
	await dinaPage.close();
});

test('Pindahkan dialog moves cards by keyboard and touch without dragging', async ({ browser }) => {
	const coordinatorPage = await browser.newPage();
	await signIn(coordinatorPage, 'rina');
	const ref = await reference(coordinatorPage);
	const prefix = unique('Akses');
	const keyboardTitle = unique(`${prefix} keyboard`);
	const touchTitle = unique(`${prefix} sentuh`);
	const keyboardTask = await createTask(coordinatorPage, ref, keyboardTitle, dina);
	const touchTask = await createTask(coordinatorPage, ref, touchTitle, dina);
	const firstInProgress = await api<{ items: Task[] }>(coordinatorPage, 'GET', '/tasks?status=in_progress&order=board&limit=1');
	const anchor = firstInProgress.items[0]?.id ?? null;
	await moveApi(coordinatorPage, keyboardTask, 'in_progress', anchor);
	await moveApi(coordinatorPage, touchTask, 'in_progress', anchor);

	const keyboardPage = await browser.newPage();
	await signIn(keyboardPage, 'dina');
	await keyboardPage.goto(`/tasks?search=${encodeURIComponent(keyboardTitle)}`);
	const button = card(keyboardPage, keyboardTitle).getByRole('button', { name: 'Pindahkan' });
	await button.focus();
	await keyboardPage.keyboard.press('Enter');
	const dialog = keyboardPage.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(keyboardTitle)}`) });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Status tujuan').focus();
	await dialog.getByLabel('Status tujuan').selectOption({ label: 'Selesai' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).focus();
	await keyboardPage.keyboard.press('Enter');
	await expect(column(keyboardPage, 'Selesai').locator('.task-card').filter({ hasText: keyboardTitle })).toBeVisible();

	const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
	const touchPage = await touchContext.newPage();
	await signIn(touchPage, 'dina');
	await touchPage.goto(`/tasks?search=${encodeURIComponent(touchTitle)}`);
	await expect(touchPage.getByRole('heading', { name: 'Tugas Perawatan' })).toBeVisible();
	const touchCard = touchPage.locator('.task-card').filter({ hasText: touchTitle });
	await touchCard.getByRole('button', { name: 'Pindahkan' }).tap();
	const touchDialog = touchPage.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(touchTitle)}`) });
	await expect(touchDialog).toBeVisible();
	await touchDialog.getByLabel('Status tujuan').selectOption({ label: 'Selesai' });
	await touchDialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).tap();
	await expect(touchPage.locator('p.success')).toContainText(/dipindahkan/i);
	await expect(column(touchPage, 'Selesai').locator('.task-card').filter({ hasText: touchTitle })).toBeVisible();
	expect(await touchPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await touchContext.close();

	await keyboardPage.close();
	await coordinatorPage.close();
});

test('cancellation requires an explicit reason and preserves it on failure', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const prefix = unique('Batal');
	const title = unique(`${prefix} tugas`);
	await createTask(page, ref, title, dina);
	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const todoCard = card(page, title);
	await expect(todoCard).toBeVisible();

	await todoCard.getByRole('button', { name: 'Pindahkan' }).click();
	let dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(title)}`) });
	await dialog.getByLabel('Status tujuan').selectOption({ label: 'Dibatalkan' });
	await expect(dialog.getByLabel('Alasan pembatalan')).toBeVisible();
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(dialog).toBeVisible();
	await expect(card(page, title)).toBeVisible();
	await expect(column(page, 'Dibatalkan').locator('.task-card').filter({ hasText: title })).toHaveCount(0);

	await dialog.getByRole('button', { name: 'Batal' }).click();
	await expect(dialog).toBeHidden();
	await expect(card(page, title)).toBeVisible();

	await card(page, title).getByRole('button', { name: 'Pindahkan' }).click();
	dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(title)}`) });
	await dialog.getByLabel('Status tujuan').selectOption({ label: 'Dibatalkan' });
	await dialog.getByLabel('Alasan pembatalan').fill('Alasan uji pembatalan.');

	let attempts = 0;
	await page.route('**/api/v1/tasks/*/move', async route => {
		attempts++;
		await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVER', message: 'Penyimpanan gagal.' } }) });
	});
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(dialog.locator('p.error')).toContainText(/gagal/i);
	await expect(dialog.getByLabel('Alasan pembatalan')).toHaveValue('Alasan uji pembatalan.');
	await expect(dialog).toBeVisible();
	await expect(column(page, 'Dibatalkan').locator('.task-card').filter({ hasText: title })).toHaveCount(0);
	await page.unroute('**/api/v1/tasks/*/move');
	expect(attempts).toBe(1);

	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(page.locator('p.success')).toContainText(/dipindahkan/i);
	await expect(column(page, 'Dibatalkan').locator('.task-card').filter({ hasText: title })).toBeVisible();
	await openButton(page, title).click();
	await expect(page.getByRole('dialog')).toContainText('Alasan uji pembatalan.');
	await expect(page.getByRole('dialog')).toContainText('updated');
	await page.close();
});

test('failed saves restore the confirmed card and prevent duplicate pending moves', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const prefix = unique('Gagal');
	const title = unique(`${prefix} simpan`);
	const task = await createTask(page, ref, title, dina);
	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	await expect(card(page, title)).toBeVisible();

	const failures: { label: string; handler: (route: import('@playwright/test').Route) => Promise<void> }[] = [
		{
			label: 'konflik',
			handler: route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CONFLICT', message: 'Tugas berubah. Muat ulang sebelum menyimpan.' } }) })
		},
		{ label: 'jaringan', handler: route => route.abort('failed') },
		{
			label: 'server',
			handler: route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVER', message: 'Penyimpanan gagal.' } }) })
		}
	];

	for (const failure of failures) {
		await page.route('**/api/v1/tasks/*/move', failure.handler);
		await card(page, title).getByRole('button', { name: 'Pindahkan' }).click();
		const dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(title)}`) });
		await dialog.getByLabel('Status tujuan').selectOption({ label: 'Sedang Dikerjakan' });
		await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
		await expect(dialog.locator('p.error')).toBeVisible();
		await expect(dialog).toBeVisible();
		await expect(card(page, title)).toBeVisible();
		await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: title })).toHaveCount(0);
		await expect(page.locator('p.success')).toHaveCount(0);
		await dialog.getByRole('button', { name: 'Batal' }).click();
		await page.unroute('**/api/v1/tasks/*/move');
	}

	let release!: () => void;
	const gate = new Promise<void>(resolve => (release = resolve));
	let moveRequests = 0;
	await page.route('**/api/v1/tasks/*/move', async route => {
		moveRequests++;
		await gate;
		await route.continue();
	});
	await card(page, title).getByRole('button', { name: 'Pindahkan' }).click();
	const pendingDialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(title)}`) });
	await pendingDialog.getByLabel('Status tujuan').selectOption({ label: 'Sedang Dikerjakan' });
	await pendingDialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: title }).locator('p[role="status"]')).toContainText('Menyimpan');
	await expect(pendingDialog.getByRole('button', { name: 'Konfirmasi pindahkan' })).toBeDisabled();
	expect(moveRequests).toBe(1);
	release();
	await expect(page.locator('p.success')).toContainText(/dipindahkan/i);
	await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: title })).toBeVisible();
	await page.unroute('**/api/v1/tasks/*/move');
	expect(moveRequests).toBe(1);
	expect(task.version).toBe(1);
	await page.close();
});

test('drag cancellation and invalid destinations make no saved change', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const prefix = unique('Batal tarik');
	const title = unique(`${prefix} kartu`);
	const created = await createTask(page, ref, title, dina);
	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const source = card(page, title);
	await expect(source).toBeVisible();

	let moveRequests = 0;
	page.on('request', request => {
		if (request.method() === 'POST' && request.url().includes('/move')) moveRequests++;
	});

	const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
	await source.dispatchEvent('dragstart', { dataTransfer });
	await page.locator('body').dispatchEvent('dragover', { dataTransfer });
	await page.locator('body').dispatchEvent('drop', { dataTransfer });
	await source.dispatchEvent('dragend', { dataTransfer });
	await expect(card(page, title)).toBeVisible();

	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Pindahkan' }).first().focus();
	await source.dispatchEvent('dragstart', { dataTransfer });
	await page.keyboard.press('Escape');
	await source.dispatchEvent('dragend', { dataTransfer });
	await expect(card(page, title)).toBeVisible();

	await source.dragTo(column(page, 'Selesai').locator('.column-heading'));
	await expect(card(page, title)).toBeVisible();
	await expect(column(page, 'Selesai').locator('.task-card').filter({ hasText: title })).toHaveCount(0);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(moveRequests).toBe(0);

	const detail = await api<Task>(page, 'GET', `/tasks/${created.id}`);
	expect(detail.status).toBe('todo');
	await page.close();
});

test('terminal lists allow position-only reordering that persists', async ({ browser }) => {
	const coordinatorPage = await browser.newPage();
	await signIn(coordinatorPage, 'rina');
	const ref = await reference(coordinatorPage);
	const prefix = unique('Selesai urut');
	const firstTitle = `${prefix} D`;
	const secondTitle = `${prefix} E`;
	const first = await createTask(coordinatorPage, ref, firstTitle, dina);
	const second = await createTask(coordinatorPage, ref, secondTitle, dina);
	const doneFirst = await api<{ items: Task[] }>(coordinatorPage, 'GET', '/tasks?status=done&order=board&limit=1');
	const anchor = doneFirst.items[0]?.id ?? null;
	const firstProgress = await moveApi(coordinatorPage, first, 'in_progress');
	const secondProgress = await moveApi(coordinatorPage, second, 'in_progress');
	await moveApi(coordinatorPage, firstProgress, 'done', anchor);
	await moveApi(coordinatorPage, secondProgress, 'done', anchor);

	const pic = await browser.newPage();
	await signIn(pic, 'dina');
	await pic.goto('/tasks');
	await expect(pic.locator('.task-board')).toBeVisible();
	expect(await titles(pic, 'Selesai', prefix)).toEqual([firstTitle, secondTitle]);

	await card(pic, secondTitle).dragTo(card(pic, firstTitle));
	await expect.poll(() => titles(pic, 'Selesai', prefix)).toEqual([secondTitle, firstTitle]);
	await expect(pic.getByRole('dialog')).toHaveCount(0);

	await pic.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	await expect.poll(() => titles(pic, 'Selesai', prefix)).toEqual([secondTitle, firstTitle]);
	const firstDetail = await api<Task>(pic, 'GET', `/tasks/${first.id}`);
	const secondDetail = await api<Task>(pic, 'GET', `/tasks/${second.id}`);
	expect([firstDetail.status, secondDetail.status]).toEqual(['done', 'done']);
	expect(secondDetail.version).toBeGreaterThan(firstDetail.version);

	await pic.close();
	await coordinatorPage.close();
});

test('filters disable position controls, append status moves, and explain filtered lists', async ({ browser }) => {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	await signIn(page, 'rina');
	const ref = await reference(page);
	const prefix = unique('Saring');
	const highTitle = `${prefix} tinggi`;
	const normalTitle = `${prefix} normal`;
	await createTask(page, ref, highTitle, dina, 'high');
	await createTask(page, ref, normalTitle, dina, 'normal');

	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}&priority=high`);
	await expect(card(page, highTitle)).toBeVisible();
	await expect(card(page, normalTitle)).toHaveCount(0);
	await card(page, highTitle).getByRole('button', { name: 'Pindahkan' }).click();
	let dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(highTitle)}`) });
	await expect(dialog.getByLabel('Posisi')).toHaveCount(0);
	await expect(dialog).toContainText('Hapus filter untuk mengatur posisi.');
	const firstOptions = await dialog.getByLabel('Status tujuan').locator('option').allTextContents();
	expect(firstOptions).toContain('Sedang Dikerjakan');
	expect(firstOptions).not.toContain('Selesai');
	await expect(page.locator('p.muted').filter({ hasText: 'Urutan dinonaktifkan saat filter aktif.' })).toBeVisible();
	await dialog.getByLabel('Status tujuan').selectOption({ label: 'Sedang Dikerjakan' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: highTitle })).toBeVisible();

	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}&status=todo`);
	await expect(card(page, normalTitle)).toBeVisible();
	await card(page, normalTitle).getByRole('button', { name: 'Pindahkan' }).click();
	dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(normalTitle)}`) });
	const secondOptions = await dialog.getByLabel('Status tujuan').locator('option').allTextContents();
	expect(secondOptions).toContain('Sedang Dikerjakan');
	expect(secondOptions).not.toContain('Selesai');
	await expect(dialog.getByLabel('Posisi')).toHaveCount(0);
	await dialog.getByLabel('Status tujuan').selectOption({ label: 'Sedang Dikerjakan' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(page.locator('p.success')).toContainText(/filter status/i);
	await expect(card(page, normalTitle)).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('heading-todo');

	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}&status=todo`);
	await expect(page.getByRole('button', { name: /status: todo - Hapus/ })).toBeVisible();
	await page.getByRole('button', { name: /status: todo - Hapus/ }).click();
	await expect(page).not.toHaveURL(/status=todo/);
	await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: normalTitle })).toBeVisible();
	await page.close();
});

test('each list reports truthful totals and loads additional cards independently', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const existing = await api<{ total: number }>(page, 'GET', '/tasks?status=todo&limit=1');
	for (let i = existing.total; i < 51; i++) await createTask(page, ref, unique('Halaman'));
	await page.goto('/tasks');
	await expect(page.locator('.task-board')).toBeVisible();
	const labels: Record<string, string> = { todo: 'Belum Dikerjakan', in_progress: 'Sedang Dikerjakan', done: 'Selesai', cancelled: 'Dibatalkan' };
	const statuses = Object.keys(labels);
	const totals: Record<string, number> = {};
	const initial: Record<string, { loaded: number; total: number }> = {};
	for (const status of statuses) {
		totals[status] = (await api<{ total: number }>(page, 'GET', `/tasks?status=${status}&limit=1`)).total;
		initial[status] = await headingCounts(page, labels[status]);
		expect(initial[status].total).toBe(totals[status]);
		expect(initial[status].loaded).toBe(Math.min(50, totals[status]));
	}
	const growing = statuses.find(status => totals[status] > 50);
	expect(growing).toBeTruthy();
	const growingLabel = labels[growing!];
	if (totals[growing!] <= 50) throw new Error('expected a status with more than 50 tasks');
	await column(page, growingLabel).getByRole('button', { name: 'Muat lebih banyak' }).click();
	await expect.poll(() => headingCounts(page, growingLabel)).toEqual({ loaded: Math.min(initial[growing!].loaded + 50, totals[growing!]), total: totals[growing!] });
	for (const status of statuses.filter(status => status !== growing)) {
		expect(await headingCounts(page, labels[status])).toEqual(initial[status]);
	}
	await page.close();
});

test('list failure, empty, and filtered states are distinct and retryable', async ({ browser }) => {
	const page = await browser.newPage();
	await signIn(page, 'rina');
	const ref = await reference(page);
	const existing = await api<{ total: number }>(page, 'GET', '/tasks?status=todo&limit=1');
	for (let i = existing.total; i < 51; i++) await createTask(page, ref, unique('Coba lagi'));
	await page.goto('/tasks');
	await expect(page.locator('.task-board')).toBeVisible();
	const todoTotal = (await api<{ total: number }>(page, 'GET', '/tasks?status=todo&limit=1')).total;
	expect(todoTotal).toBeGreaterThan(50);
	await page.route(/\/api\/v1\/tasks\?.*status=todo.*offset=50/, route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVER', message: 'Daftar gagal dimuat.' } }) }));
	await column(page, 'Belum Dikerjakan').getByRole('button', { name: 'Muat lebih banyak' }).click();
	await expect(column(page, 'Belum Dikerjakan').locator('.column-heading > span')).toHaveText('Gagal dimuat');
	await expect(column(page, 'Belum Dikerjakan').getByRole('alert')).toContainText('Daftar gagal dimuat');
	await page.unroute(/\/api\/v1\/tasks\?.*status=todo.*offset=50/);
	await column(page, 'Belum Dikerjakan').getByRole('button', { name: 'Coba lagi' }).click();
	await expect.poll(async () => (await headingCounts(page, 'Belum Dikerjakan')).loaded).toBe(Math.min(100, todoTotal));
	await expect(column(page, 'Belum Dikerjakan').getByRole('alert')).toHaveCount(0);

	await page.goto(`/tasks?search=${encodeURIComponent(`Kosong ${Date.now()}`)}`);
	await expect(page.locator('.task-column .empty').filter({ hasText: 'Tidak ada tugas.' })).toHaveCount(4);
	for (const label of ['Belum Dikerjakan', 'Sedang Dikerjakan', 'Selesai', 'Dibatalkan']) expect(await headingCounts(page, label)).toEqual({ loaded: 0, total: 0 });

	await page.goto('/tasks?status=done');
	await expect(page.locator('.task-column .empty').filter({ hasText: 'Disembunyikan oleh filter status.' })).toHaveCount(3);
	expect(await column(page, 'Selesai').locator('.task-card').count()).toBeGreaterThan(0);
	await page.close();
});

test('card details restore focus and retain management forms', async ({ browser }) => {
	const coordinatorPage = await browser.newPage();
	await signIn(coordinatorPage, 'rina');
	const ref = await reference(coordinatorPage);
	const prefix = unique('Kelola');
	const title = `${prefix} awal`;
	const task = await createTask(coordinatorPage, ref, title, dina);

	const dinaPage = await browser.newPage();
	await signIn(dinaPage, 'dina');
	await dinaPage.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const open = openButton(dinaPage, title);
	await open.focus();
	await open.click();
	await expect(dinaPage.getByRole('dialog')).toContainText(title);
	await dinaPage.getByRole('button', { name: 'Tutup' }).click();
	await expect(dinaPage.getByRole('dialog')).toBeHidden();
	await expect.poll(() => dinaPage.evaluate(() => document.activeElement?.id)).toBe(`task-${task.id}`);

	await coordinatorPage.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	await openDetails(coordinatorPage, title);
	const revised = `${prefix} revisi`;
	let detail = coordinatorPage.getByRole('dialog', { name: new RegExp(escape(title)) });
	await detail.getByText('Ubah detail tugas').click();
	await detail.getByLabel('Judul').fill(revised);
	await detail.getByRole('button', { name: 'Simpan detail' }).click();
	await expect(coordinatorPage.locator('p.success')).toContainText(/berhasil/i);
	await expect(coordinatorPage.getByRole('dialog')).toContainText(revised);

	detail = coordinatorPage.getByRole('dialog', { name: new RegExp(escape(revised)) });
	await detail.getByLabel('Alihkan ke perawat').selectOption({ label: 'Bima Pratama' });
	await detail.getByLabel('Alasan pengalihan').fill('Pengalihan uji peran.');
	await detail.getByRole('button', { name: 'Alihkan PIC' }).click();
	await expect(coordinatorPage.locator('p.success')).toContainText(/berhasil/i);
	await expect(coordinatorPage.getByRole('dialog')).toContainText('Bima Pratama');
	await coordinatorPage.getByRole('button', { name: 'Tutup' }).click();

	await dinaPage.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	await expect(dinaPage.locator('.task-card').filter({ hasText: revised })).toHaveCount(0);

	const cancelPrefix = unique('Batal detail');
	const cancelTitle = `${cancelPrefix} tugas`;
	await createTask(coordinatorPage, ref, cancelTitle, dina);
	await coordinatorPage.goto(`/tasks?search=${encodeURIComponent(cancelPrefix)}`);
	await openDetails(coordinatorPage, cancelTitle);
	detail = coordinatorPage.getByRole('dialog', { name: new RegExp(escape(cancelTitle)) });
	await detail.getByRole('button', { name: 'Batalkan dengan alasan' }).click();
	const cancelDialog = coordinatorPage.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(cancelTitle)}`) });
	await cancelDialog.getByLabel('Alasan pembatalan').fill('Alasan batal dari detail.');
	await cancelDialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(coordinatorPage.locator('p.success')).toContainText(/dipindahkan/i);
	await expect(column(coordinatorPage, 'Dibatalkan').locator('.task-card').filter({ hasText: cancelTitle })).toBeVisible();
	await openButton(coordinatorPage, cancelTitle).click();
	await expect(coordinatorPage.getByRole('dialog')).toContainText('Alasan batal dari detail.');
	await coordinatorPage.getByRole('button', { name: 'Tutup' }).click();

	const deletePrefix = unique('Hapus detail');
	const deleteTitle = `${deletePrefix} tugas`;
	await createTask(coordinatorPage, ref, deleteTitle, dina);
	await coordinatorPage.goto(`/tasks?search=${encodeURIComponent(deletePrefix)}`);
	await openDetails(coordinatorPage, deleteTitle);
	await coordinatorPage.getByRole('dialog', { name: new RegExp(escape(deleteTitle)) }).getByRole('button', { name: 'Hapus logis dengan alasan' }).click();
	const removal = coordinatorPage.getByRole('dialog', { name: 'Hapus tugas?', exact: true });
	await removal.getByLabel('Alasan penghapusan').fill('Alasan hapus dari detail.');
	await removal.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
	await expect(removal).toHaveCount(0);
	await expect(coordinatorPage.locator('p.success')).toContainText(/berhasil/i);
	await expect(coordinatorPage.locator('.task-card').filter({ hasText: deleteTitle })).toHaveCount(0);

	await dinaPage.close();
	await coordinatorPage.close();
});

test('board geometry, long content, mobile overflow, and evidence screenshots', async ({ browser }) => {
	await mkdir(evidence, { recursive: true });
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	await signIn(page, 'rina');
	const ref = await reference(page);
	const token = unique('Visual');
	const longTitle = `${token} ${'observasi perawatan intensif '.repeat(4)}`.trim().slice(0, 150);
	const task = await createTask(page, ref, longTitle, dina);
	const todoFirst = await api<{ items: Task[] }>(page, 'GET', '/tasks?status=todo&order=board&limit=1');
	await moveApi(page, task, 'todo', todoFirst.items[0]?.id ?? null);
	await page.goto('/tasks');
	await expect(page.locator('.task-board')).toBeVisible();
	await page.evaluate(() => document.fonts.ready);

	const metrics = await page.evaluate(() => {
		const board = document.querySelector<HTMLElement>('.task-board')!;
		const firstColumn = document.querySelector<HTMLElement>('.task-column')!;
		const heading = document.querySelector<HTMLElement>('.column-heading')!;
		return {
			documentWidth: document.documentElement.scrollWidth,
			viewport: window.innerWidth,
			boardClient: board.clientWidth,
			boardScroll: board.scrollWidth,
			firstWidth: firstColumn.getBoundingClientRect().width,
			boardOverflowX: getComputedStyle(board).overflowX,
			columnOverflowY: getComputedStyle(firstColumn).overflowY,
			headingPosition: getComputedStyle(heading).position,
			columnScrolls: firstColumn.scrollHeight > firstColumn.clientHeight
		};
	});
	expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
	expect(metrics.boardScroll).toBeGreaterThan(metrics.boardClient);
	expect(metrics.firstWidth).toBeGreaterThanOrEqual(279);
	expect(metrics.firstWidth).toBeLessThanOrEqual(305);
	expect(metrics.boardOverflowX).toBe('auto');
	expect(metrics.columnOverflowY).toBe('auto');
	expect(metrics.headingPosition).toBe('sticky');
	expect(metrics.columnScrolls).toBe(true);

	const longCard = card(page, token);
	await expect(longCard).toBeVisible();
	await expect(longCard.locator('.card-title')).toHaveText(longTitle);
	const cardFits = await longCard.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
	expect(cardFits).toBe(true);
	await page.screenshot({ path: path.join(evidence, 'tugas-board-desktop.png'), fullPage: true, animations: 'disabled' });

	await longCard.getByRole('button', { name: 'Pindahkan' }).click();
	await expect(page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(token)}`) })).toBeVisible();
	await page.screenshot({ path: path.join(evidence, 'tugas-board-move-dialog.png'), animations: 'disabled' });
	await page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(token)}`) }).getByRole('button', { name: 'Batal' }).click();
	await longCard.getByRole('button', { name: new RegExp(escape(token)) }).click();
	await expect(page.getByRole('dialog')).toContainText(token);
	await page.screenshot({ path: path.join(evidence, 'tugas-board-detail.png'), animations: 'disabled' });
	await page.getByRole('button', { name: 'Tutup' }).click();

	await page.setViewportSize({ width: 390, height: 844 });
	await page.evaluate(() => document.fonts.ready);
	const mobile = await page.evaluate(() => {
		const board = document.querySelector<HTMLElement>('.task-board')!;
		const columns = [...document.querySelectorAll<HTMLElement>('.task-column')];
		return {
			documentWidth: document.documentElement.scrollWidth,
			viewport: window.innerWidth,
			boardClient: board.clientWidth,
			boardScroll: board.scrollWidth,
			firstX: columns[0].getBoundingClientRect().x,
			secondX: columns[1].getBoundingClientRect().x,
			firstY: columns[0].getBoundingClientRect().y,
			secondY: columns[1].getBoundingClientRect().y
		};
	});
	expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewport + 1);
	expect(mobile.boardScroll).toBeGreaterThan(mobile.boardClient);
	expect(mobile.secondX).toBeGreaterThan(mobile.firstX);
	expect(Math.abs(mobile.secondY - mobile.firstY)).toBeLessThan(2);
	await expect(page.getByRole('heading', { name: 'Tugas Perawatan' })).toBeVisible();
	await page.screenshot({ path: path.join(evidence, 'tugas-board-mobile.png'), fullPage: true, animations: 'disabled' });

	const board = page.locator('.task-board');
	await board.evaluate(element => (element.scrollLeft = 0));
	await board.hover();
	await page.mouse.wheel(240, 0);
	let scrolled = await board.evaluate(element => element.scrollLeft);
	if (!scrolled) {
		await board.evaluate(element => (element.scrollLeft = 160));
		scrolled = await board.evaluate(element => element.scrollLeft);
	}
	expect(scrolled).toBeGreaterThan(0);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.emulateMedia({ reducedMotion: 'reduce' });
	expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
	await page.reload();
	await expect(page.locator('.task-board')).toBeVisible();
	await page.close();
});
