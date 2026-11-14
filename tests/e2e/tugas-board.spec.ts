import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { selectOption, optionLabels } from '../select-option.mjs';

const password = 'InpaCareDemo!2026';
const evidence = path.resolve('.local/evidence');
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
		headers: { 'x-csrf-token': csrf, origin: new URL(page.url()).origin },
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
	const loaded = await column(page, label).locator('.task-card').count();
	const total = Number(await column(page, label).locator('.column-heading [data-slot="badge"]').innerText());
	return { loaded, total };
}

async function titles(page: Page, label: string, prefix: string) {
	const all = await column(page, label).locator('.card-title').allTextContents();
	return all.filter(title => title.startsWith(prefix));
}

async function moveVia(page: Page, title: string, statusLabel: string, options: { before?: string; reason?: string } = {}) {
	await card(page, title).getByRole('button', { name: 'Pindahkan' }).click();
	const dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(title)}`) });
	await selectOption(dialog.getByLabel('Status tujuan'), { label: statusLabel });
	if (options.before) await selectOption(dialog.getByLabel('Posisi'), { label: `Sebelum ${options.before}` });
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

test('terminal cards stay readable in Detail and cannot be moved or dragged', async ({ browser }) => {
	const author = await browser.newPage();
	await signIn(author, 'rina');
	const ref = await reference(author);
	const prefix = unique('Terminal hanya detail');
	const cancelled = await createTask(author, ref, `${prefix} dibatalkan`);
	const cancelledTask = await moveApi(author, cancelled, 'cancelled', null, 'Perawatan tidak lagi diperlukan.');
	const completed = await createTask(author, ref, `${prefix} selesai`);
	const inProgress = await moveApi(author, completed, 'in_progress');
	await moveApi(author, inProgress, 'done');
	const pic = await browser.newPage();
	await signIn(pic, 'dina');
	await pic.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const longAuditValue = `Nilai audit panjang ${'rincian perawatan '.repeat(24)}`;
	await pic.route(`**/api/v1/tasks/${cancelledTask.id}/history`, route => route.fulfill({
		contentType: 'application/json',
		body: JSON.stringify({ items: [{ id: 'history-fixture', actorId: coordinator, actorName: 'Rina', action: 'updated', reason: 'Perawatan tidak lagi diperlukan.', before: null, after: { title: 'Judul audit', status: 'cancelled', priority: 'high', picId: dina, pic_nurse_id: dina, created_by: coordinator, starts_at: '2026-11-14T12:00:00.000Z', version: 3, emptyValue: null, isVerified: false, futureMeta: { unknownKey: longAuditValue } }, createdAt: new Date().toISOString() }] })
	}));
	for (const [title, label] of [[`${prefix} dibatalkan`, 'Dibatalkan'], [`${prefix} selesai`, 'Selesai']]) {
		const terminalCard = card(pic, title);
		await expect(terminalCard).toBeVisible();
		await expect(terminalCard).toHaveAttribute('draggable', 'false');
		await expect(terminalCard.getByRole('button', { name: 'Pindahkan' })).toHaveCount(0);
		const detailButton = terminalCard.getByRole('button', { name: 'Detail', exact: true });
		await detailButton.click();
		const dialog = pic.getByRole('dialog', { name: title });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Pindahkan' })).toHaveCount(0);
		if (label === 'Dibatalkan') await expect(dialog).toContainText('Perawatan tidak lagi diperlukan.');
		await dialog.locator('.audit-disclosure summary').first().click();
		await expect(dialog.locator('.audit-row').first()).toBeVisible();
		const auditText = (await dialog.locator('.audit-row').allTextContents()).join('\n');
		expect(auditText).toContain('Status');
		if (label === 'Dibatalkan') {
			expect(auditText).toContain('Belum ada data');
			expect(auditText).toContain('Judul');
			expect(auditText).toContain('Dibuat oleh');
			expect(auditText).toContain('Waktu mulai');
			expect(auditText).toContain('14 Nov 2026');
			expect(auditText).toContain('Versi');
			expect(auditText).toContain('Dibatalkan');
			expect(auditText).toContain('Tinggi');
			expect(auditText).toContain(ref.staff.find(staff => staff.id === dina)!.name);
			expect(auditText).not.toContain(dina);
			expect(auditText).not.toContain(coordinator);
			expect(auditText).toContain(longAuditValue);
			expect(auditText).toContain('Unknown Key');
			expect(auditText).toContain('Tidak');
		}
		expect(auditText).not.toContain('{');
		expect(auditText).not.toContain('null');
		if (label === 'Dibatalkan') {
			await mkdir(evidence, { recursive: true });
			await dialog.locator('.audit-disclosure').scrollIntoViewIfNeeded();
			await pic.screenshot({ path: path.join(evidence, 'tugas-board-history.png'), animations: 'disabled' });
			await pic.setViewportSize({ width: 390, height: 844 });
			await dialog.locator('.audit-row').first().scrollIntoViewIfNeeded();
			expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
			await pic.screenshot({ path: path.join(evidence, 'tugas-board-history-mobile.png'), animations: 'disabled' });
			await pic.setViewportSize({ width: 1440, height: 1000 });
		}
		await dialog.getByRole('button', { name: 'Tutup' }).click();
		await expect(detailButton).toBeFocused();
	}
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

test('native drag keeps insertion targets still and uses the final pointer in card margins', async ({ browser }) => {
	const author = await browser.newPage();
	await signIn(author, 'rina');
	const ref = await reference(author);
	const prefix = unique('Drop hitbox');
	const [source, first, second] = await Promise.all([
		createTask(author, ref, `${prefix} source`),
		createTask(author, ref, `${prefix} first`),
		createTask(author, ref, `${prefix} second`)
	]);
	const existing = await api<{ items: Task[] }>(author, 'GET', '/tasks?status=in_progress&order=board&limit=1');
	const existingTodo = await api<{ items: Task[] }>(author, 'GET', '/tasks?status=todo&order=board&limit=1');
	await moveApi(author, source, 'todo', existingTodo.items[0]?.id ?? null);
	await moveApi(author, first, 'in_progress', existing.items[0]?.id ?? null);
	await moveApi(author, second, 'in_progress', first.id);

	const pic = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	await signIn(pic, 'dina');
	await pic.goto('/tasks');
	const sourceCard = card(pic, source.title);
	const targetColumn = column(pic, 'Sedang Dikerjakan');
	const firstCard = card(pic, second.title);
	const secondCard = card(pic, first.title);
	await expect(firstCard).toBeVisible();
	await expect(secondCard).toBeVisible();
	const sourceBox = await sourceCard.boundingBox();
	const firstBox = await firstCard.boundingBox();
	const secondBox = await secondCard.boundingBox();
	expect(sourceBox).not.toBeNull();
	expect(firstBox).not.toBeNull();
	expect(secondBox).not.toBeNull();

	await pic.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
	await pic.mouse.down();
	await pic.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + 5, { steps: 12 });
	await pic.waitForTimeout(250);
	const stationaryTargetY = await firstCard.evaluate(element => element.getBoundingClientRect().y);
	expect(Math.abs(stationaryTargetY - firstBox!.y)).toBeLessThan(2);

	// The browser pointer finishes in the inter-card margin, near the next card.
	const finalPoint = await secondCard.boundingBox();
	expect(finalPoint).not.toBeNull();
	const finalX = finalPoint!.x + finalPoint!.width / 2;
	const finalY = finalPoint!.y - 2;
	await pic.mouse.move(finalX, finalY, { steps: 5 });
	await pic.mouse.up();
	await expect.poll(() => titles(pic, 'Sedang Dikerjakan', prefix)).toEqual([
		second.title,
		source.title,
		first.title
	]);
	await expect(targetColumn.locator('.task-card').filter({ hasText: source.title })).toBeVisible();
	await expect(pic.locator('p.success')).toHaveText(`${source.title} dipindahkan ke Sedang Dikerjakan.`);

	const blankSource = await createTask(author, ref, `${prefix} blank`);
	await moveApi(author, blankSource, 'in_progress', first.id);
	await pic.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const blankSourceCard = card(pic, blankSource.title);
	const emptyDoneColumn = column(pic, 'Selesai');
	await expect(blankSourceCard).toBeVisible();
	await blankSourceCard.scrollIntoViewIfNeeded();
	const blankSourceBox = await blankSourceCard.boundingBox();
	const emptyColumnBox = await emptyDoneColumn.boundingBox();
	expect(blankSourceBox).not.toBeNull();
	expect(emptyColumnBox).not.toBeNull();
	await pic.mouse.move(blankSourceBox!.x + blankSourceBox!.width / 2, blankSourceBox!.y + blankSourceBox!.height / 2);
	await pic.mouse.down();
	await pic.mouse.move(emptyColumnBox!.x + 2, emptyColumnBox!.y + 130, { steps: 12 });
	await pic.mouse.up();
	await expect(emptyDoneColumn.locator('.task-card').filter({ hasText: blankSource.title })).toBeVisible();
	await expect(pic.locator('p.success')).toHaveText(`${blankSource.title} dipindahkan ke Selesai.`);

	await pic.goto('/tasks');
	await expect(column(pic, 'Selesai').locator('.task-card').filter({ hasText: blankSource.title })).toBeVisible();
	const ownCard = card(pic, source.title);
	await expect(ownCard).toBeVisible();
	await ownCard.scrollIntoViewIfNeeded();
	const ownBox = await ownCard.boundingBox();
	expect(ownBox).not.toBeNull();
	const beforeNoOp = await api<Task>(pic, 'GET', `/tasks/${source.id}`);
	let ownMoveRequests = 0;
	pic.on('request', request => {
		if (request.method() === 'POST' && request.url().includes(`/tasks/${source.id}/move`)) ownMoveRequests++;
	});
	await pic.mouse.move(ownBox!.x + ownBox!.width / 2, ownBox!.y + ownBox!.height / 2);
	await pic.mouse.down();
	await pic.mouse.move(ownBox!.x + ownBox!.width / 2 + 24, ownBox!.y + ownBox!.height / 2, { steps: 4 });
	await expect(ownCard).toHaveClass(/opacity-50/);
	await pic.mouse.move(ownBox!.x + ownBox!.width / 2, ownBox!.y + ownBox!.height / 2, { steps: 4 });
	await pic.mouse.up();
	await expect(ownCard).not.toHaveClass(/opacity-50/);
	expect(ownMoveRequests).toBe(0);
	await expect.poll(async () => (await api<Task>(pic, 'GET', `/tasks/${source.id}`)).version).toBe(beforeNoOp.version);
	expect(await titles(pic, 'Sedang Dikerjakan', prefix)).toEqual([
		second.title,
		source.title,
		first.title
	]);

	await pic.close();
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
	await expect(mineCard.getByRole('button', { name: 'Detail', exact: true })).toBeVisible();
	await expect(mineCard.getByRole('button', { name: 'Pindahkan' })).toBeVisible();
	await mineCard.getByRole('button', { name: 'Pindahkan' }).click();
	let dialog = dinaPage.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(mine)}`) });
	expect(await optionLabels(dialog.getByLabel('Status tujuan'))).toEqual(['Sedang Dikerjakan']);
	await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Sedang Dikerjakan' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(dinaPage.locator('p.success')).toContainText(/dipindahkan/i);
	await expect(column(dinaPage, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: mine })).toBeVisible();

	await card(dinaPage, mine).getByRole('button', { name: 'Pindahkan' }).click();
	dialog = dinaPage.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(mine)}`) });
	expect(await optionLabels(dialog.getByLabel('Status tujuan'))).toEqual(['Selesai']);
	await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Selesai' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(column(dinaPage, 'Selesai').locator('.task-card').filter({ hasText: mine })).toBeVisible();
	await expect(card(dinaPage, mine).getByRole('button', { name: 'Pindahkan' })).toHaveCount(0);
	await openDetails(dinaPage, mine);
	await expect(dinaPage.getByRole('dialog').getByRole('button', { name: 'Pindahkan' })).toHaveCount(0);
	await dinaPage.getByRole('button', { name: 'Tutup' }).click();

	await coordinatorPage.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
	const coordinatorOther = card(coordinatorPage, other);
	await expect(coordinatorOther).toBeVisible();
	await expect(coordinatorOther.getByRole('button', { name: 'Detail', exact: true })).toBeVisible();
	await expect(coordinatorOther.getByRole('button', { name: 'Pindahkan' })).toBeVisible();
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
	await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Selesai' });
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
	await selectOption(touchDialog.getByLabel('Status tujuan'), { label: 'Selesai' });
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
	await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Dibatalkan' });
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
	await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Dibatalkan' });
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
	await expect(page.getByRole('dialog')).toContainText('Detail atau status diperbarui');
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
		await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Sedang Dikerjakan' });
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
	await selectOption(pendingDialog.getByLabel('Status tujuan'), { label: 'Sedang Dikerjakan' });
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
	const firstOptions = await optionLabels(dialog.getByLabel('Status tujuan'));
	expect(firstOptions).toContain('Sedang Dikerjakan');
	expect(firstOptions).not.toContain('Selesai');
	await expect(page.locator('p.muted').filter({ hasText: 'Urutan dinonaktifkan saat filter aktif.' })).toBeVisible();
	await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Sedang Dikerjakan' });
	await dialog.getByRole('button', { name: 'Konfirmasi pindahkan' }).click();
	await expect(column(page, 'Sedang Dikerjakan').locator('.task-card').filter({ hasText: highTitle })).toBeVisible();

	await page.goto(`/tasks?search=${encodeURIComponent(prefix)}&status=todo`);
	await expect(card(page, normalTitle)).toBeVisible();
	await card(page, normalTitle).getByRole('button', { name: 'Pindahkan' }).click();
	dialog = page.getByRole('dialog', { name: new RegExp(`Pindahkan ${escape(normalTitle)}`) });
	const secondOptions = await optionLabels(dialog.getByLabel('Status tujuan'));
	expect(secondOptions).toContain('Sedang Dikerjakan');
	expect(secondOptions).not.toContain('Selesai');
	await expect(dialog.getByLabel('Posisi')).toHaveCount(0);
	await selectOption(dialog.getByLabel('Status tujuan'), { label: 'Sedang Dikerjakan' });
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
		await expect(column(page, labels[status]).locator('.column-heading [data-slot="badge"]')).toHaveText(String(totals[status]));
		await expect(column(page, labels[status]).locator('.column-heading .sr-only')).toHaveText(`${initial[status].loaded} dari ${totals[status]} tugas dimuat`);
	}
	const growing = statuses.find(status => totals[status] > 50);
	expect(growing).toBeTruthy();
	const growingLabel = labels[growing!];
	if (totals[growing!] <= 50) throw new Error('expected a status with more than 50 tasks');
	// The last loaded card is not the last saved card when another page exists.
	const lastLoaded = column(page, growingLabel).locator('.task-card').last();
	const lastLoadedId = await lastLoaded.getAttribute('data-task-id');
	expect(lastLoadedId).toBeTruthy();
	await lastLoaded.dragTo(column(page, growingLabel).locator('.column-heading'));
	await expect.poll(async () => {
		const tail = await api<{ items: Task[] }>(page, 'GET', `/tasks?status=${growing}&order=board&limit=1&offset=${totals[growing!] - 1}`);
		return tail.items[0]?.id;
	}).toBe(lastLoadedId);
	await expect(column(page, growingLabel).locator('.task-card[data-task-id="' + lastLoadedId + '"]')).toHaveCount(0);
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
	await expect(column(page, 'Belum Dikerjakan').locator('.column-heading [data-slot="badge"]')).toHaveText('Gagal dimuat');
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
	await selectOption(detail.getByLabel('Alihkan ke perawat'), { label: 'Bima Pratama' });
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
	await longCard.getByRole('button', { name: 'Detail', exact: true }).click();
	const mobileDetail = page.getByRole('dialog', { name: longTitle });
	await expect(mobileDetail).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.screenshot({ path: path.join(evidence, 'tugas-board-detail-mobile.png'), animations: 'disabled' });
	await mobileDetail.getByRole('button', { name: 'Tutup' }).click();
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
