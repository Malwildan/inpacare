import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const password = 'InpaCareDemo!2026';
const evidence = path.resolve('.local/evidence');
const browserErrors = new WeakMap<Page, { uncaught:string[]; moduleHttp:string[] }>();

function monitor(page:Page) {
	const issues={uncaught:[] as string[],moduleHttp:[] as string[]};
	page.on('pageerror',(error)=>issues.uncaught.push(error.message));
	page.on('console',(message)=>{if(message.type()==='error'&&!/401 \(Unauthorized\)/.test(message.text()))issues.uncaught.push(message.text());});
	page.on('response',(response)=>{if(response.url().includes('/api/v1/')&&response.status()>=400&&!/\/session(?:\?|$)/.test(new URL(response.url()).pathname))issues.moduleHttp.push(`${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()}`);});
	browserErrors.set(page,issues);
}

function expectNoBrowserErrors(page:Page) {
	const issues=browserErrors.get(page);
	expect(issues?.uncaught,`Unexpected browser console/page errors`).toEqual([]);
	expect(issues?.moduleHttp,`Unexpected module HTTP errors`).toEqual([]);
}

async function signIn(page: Page, username: string) {
	monitor(page);
	await page.goto('/login');
	await page.getByLabel('ID petugas').fill(username);
	await page.getByLabel('Kata sandi', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).not.toHaveURL(/\/login$/);
}

test('login rejects bad credentials, signs in, and revokes the session on logout', async ({ page }) => {
	monitor(page);
	await page.goto('/login');
	await mkdir(evidence, { recursive: true });
	await page.screenshot({path:path.join(evidence,'login-desktop.png'),fullPage:true,animations:'disabled'});
	await page.getByLabel('ID petugas').fill('rina');
	await page.getByLabel('Kata sandi', { exact: true }).fill('wrong');
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page.getByRole('alert')).toContainText(/tidak sesuai/i);
	await page.getByLabel('Kata sandi', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(page.getByRole('heading', { name: 'Dashboard Siklus Inpatient Care' })).toBeVisible();
	await page.getByRole('button', { name: /Keluar/ }).click();
	await expect(page).toHaveURL(/\/login$/);
	const protectedPage = await page.request.get('/tasks', { maxRedirects: 0 });
	expect(protectedPage.status()).toBe(303);
	expectNoBrowserErrors(page);
});

for (const [username, destination] of [['rina', '/dashboard'], ['admisi', '/invoices']] as const) {
	test(`persistent session restores ${username} after reload and a new browser context`, async ({ browser }) => {
		const initial = await browser.newContext();
		const page = await initial.newPage();
		await signIn(page, username);
		await page.reload();
		await expect(page).toHaveURL(new RegExp(`${destination}$`));
		const state = await initial.storageState();
		for (const name of ['session', 'csrf_token']) {
			const cookie = state.cookies.find(cookie => cookie.name === name);
			expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 60 * 60);
		}
		await initial.close();

		const restored = await browser.newContext({ storageState: state });
		try {
			const returning = await restored.newPage();
			await returning.goto('/login');
			await expect(returning).toHaveURL(new RegExp(`${destination}$`));
			expect((await returning.request.get('/api/v1/session')).status()).toBe(200);
			await returning.getByRole('button', { name: /Keluar/ }).click();
			await expect(returning).toHaveURL(/\/login$/);
			expect((await returning.request.get('/api/v1/session')).status()).toBe(401);
			const protectedPage = await returning.request.get(destination, { maxRedirects: 0 });
			expect(protectedPage.status()).toBe(303);
		} finally {
			await restored.close();
		}
	});
}

test('a signed-in coordinator can open the six core module routes', async ({ page }) => {
	await signIn(page, 'rina');
	for (const [route, heading] of [
		['/dashboard', 'Dashboard Siklus Inpatient Care'],
		['/rooms', 'Manajemen Ruangan'],
		['/calendar', 'Kalender Ruangan'],
		['/tasks', 'Tugas Perawatan'],
		['/medical-records', 'Daftar Rekam Medis']
	] as const) {
		await page.goto(route);
		await expect(page.getByRole('heading', { name: heading })).toBeVisible();
	}
	const nurseContext=await page.context().browser()!.newContext({viewport:{width:1440,height:1000}});
	const nurse=await nurseContext.newPage();
	await signIn(nurse,'dina');
	await nurse.goto('/dashboard');
	await expect(nurse.getByRole('heading',{name:'Dashboard Siklus Inpatient Care'})).toBeVisible();
	await mkdir(evidence,{recursive:true});
	await nurse.screenshot({path:path.join(evidence,'dashboard-dina-desktop.png'),fullPage:true,animations:'disabled'});
	await nurseContext.close();
});

test('coordinator creates a nursing task that its PIC can progress and view with history', async ({ browser }) => {
	const coordinator = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	const title = `E2E Observasi ${Date.now()}`;
	await signIn(coordinator, 'rina');
	await coordinator.goto('/tasks');
	await expect(coordinator.getByRole('heading', { name: 'Tugas Perawatan' })).toBeVisible();
	await coordinator.getByRole('button', { name: /Buat tugas/ }).click();
	await coordinator.getByLabel('Penempatan pasien').selectOption({ index: 1 });
	await coordinator.getByLabel('Perawat PIC').selectOption({ label: 'Dina Putri' });
	await coordinator.getByLabel('Judul', { exact: true }).fill(title);
	await coordinator.locator('.form-panel').getByLabel('Prioritas').selectOption('normal');
	const starts = new Date(Date.now() + 5 * 60_000);
	const ends = new Date(starts.getTime() + 45 * 60_000);
	const local = (value: Date) => {const date=new Date(value.getTime()-value.getTimezoneOffset()*60_000);return date.toISOString().slice(0,16);};
	await coordinator.getByLabel('Waktu mulai').fill(local(starts));
	await coordinator.getByLabel('Waktu selesai').fill(local(ends));
	await coordinator.getByRole('button', { name: 'Simpan tugas' }).click();
	await expect(coordinator.getByText(title)).toBeVisible();
	await mkdir(evidence, { recursive: true });
	await coordinator.screenshot({ path: path.join(evidence, 'tasks-desktop.png'), fullPage: true });

	const pic=await browser.newPage();
	await signIn(pic,'dina');
	await pic.goto(`/tasks?search=${encodeURIComponent(title)}&page=0`);
	const card=pic.locator('.task-card').filter({hasText:title});
	await expect(card).toBeVisible();
	await card.getByRole('button',{name:'Mulai'}).click();
	await expect(pic.getByRole('status')).toContainText(/berhasil/i);
	await expect(pic.getByRole('dialog')).toContainText(title);
	await expect(pic.getByRole('dialog')).toContainText('created');
	await pic.getByLabel('Catatan tindakan').fill('Pemeriksaan diselesaikan melalui alur E2E.');
	await pic.getByRole('button',{name:'Simpan catatan'}).click();
	await expect(pic.getByRole('dialog')).toContainText('Pemeriksaan diselesaikan melalui alur E2E.');
	await pic.reload();
	const persistedColumn=pic.locator('.task-column').filter({hasText:title});
	await expect(persistedColumn.getByText('Sedang Dikerjakan',{exact:true})).toBeVisible();
	await pic.screenshot({path:path.join(evidence,'task-detail.png'),fullPage:true});
	expectNoBrowserErrors(coordinator);
	expectNoBrowserErrors(pic);
	await pic.close();
	await coordinator.close();
});

test('role navigation only exposes the signed-in role’s screens and small screens retain navigation', async ({ browser }) => {
	const admission=await browser.newPage({viewport:{width:1440,height:1000}});
	await signIn(admission,'admisi');
	await expect(admission).toHaveURL(/\/invoices$/);
	await expect(admission.getByRole('link',{name:'Tagihan'})).toBeVisible();
	await expect(admission.getByRole('link',{name:'Tugas Perawatan'})).toHaveCount(0);
	await admission.goto('/invoices');
	await expect(admission.getByRole('heading',{name:'Manajemen Tagihan'})).toBeVisible();
	let createdInvoiceId='';
	admission.on('response',async(response)=>{if(response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v1/invoices'&&response.status()===201){createdInvoiceId=(await response.json()).id;}});
	await admission.getByRole('button',{name:/Buat tagihan/}).click();
	const form=admission.locator('.create-form');
	await form.getByLabel('Pasien').selectOption('PT-012');
	await form.getByLabel('Layanan').fill(`E2E layanan ${Date.now()}`);
	await form.getByLabel('Qty').fill('2');
	await form.getByLabel('Harga satuan (Rp)').fill('1250.25');
	await form.getByLabel('Jumlah jaminan BPJS (Rp)').fill('500');
	await form.getByRole('button',{name:'Simpan tagihan'}).click();
	await expect(admission.getByRole('status')).toContainText(/berhasil/i);
	await admission.reload();
	await expect.poll(()=>createdInvoiceId,{timeout:7500}).not.toBe('');
	const invoice=admission.getByRole('row').filter({hasText:createdInvoiceId});
	await expect(invoice).toContainText('Belum dibayar');
	await invoice.getByText('Ubah status').click();
	await invoice.locator('form').getByLabel('Alasan').fill('Bukti penerimaan diverifikasi dalam uji demo.');
	await invoice.locator('form').getByRole('button',{name:'Simpan'}).click();
	await expect(invoice).toContainText('Lunas');
	await invoice.getByRole('button',{name:'Lihat detail'}).click();
	await expect(admission.locator('.invoice-detail')).toContainText('Bukti penerimaan diverifikasi dalam uji demo.');
	await mkdir(evidence,{recursive:true});
	await admission.screenshot({path:path.join(evidence,'invoices-desktop.png'),fullPage:true});
	await admission.setViewportSize({width:390,height:844});
	await admission.evaluate(()=>document.fonts.ready);
	expect(await admission.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await admission.screenshot({path:path.join(evidence,'invoices-mobile.png'),fullPage:true,animations:'disabled'});
	await admission.getByRole('button',{name:'Buka navigasi'}).click();
	await expect(admission.getByRole('navigation',{name:'Navigasi utama'})).toBeVisible();
	expectNoBrowserErrors(admission);
	await admission.close();
});

test('doctor and nurse complete medical record view, create, observation, update, and logical delete workflows', async ({ browser }) => {
	const doctor = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	const diagnosis = `Diagnosis E2E ${Date.now()}`;
	await signIn(doctor, 'hendra');

	// Out-of-scope record returns 404, not 500
	const outOfScope = await doctor.request.get('/medical-records/MR-002');
	expect(outOfScope.status()).toBe(404);

	// UC-DR-01 & UC-DR-02: View list and create medical record while registering a new patient
	const newPatientName = `Pasien E2E ${Date.now()}`;
	await doctor.goto('/medical-records');
	await expect(doctor.getByRole('heading', { name: 'Daftar Rekam Medis' })).toBeVisible();
	await doctor.getByRole('button', { name: /Tambah rekam medis/ }).click();
	await doctor.getByRole('button', { name: /Pasien baru/ }).click();
	await doctor.getByLabel('Nama pasien baru').fill(newPatientName);
	await doctor.getByLabel('Tanggal lahir').fill('1994-06-15');
	await doctor.getByLabel('Jenis kelamin').selectOption('P');
	await doctor.getByLabel('Peserta BPJS Kesehatan').check();
	await doctor.getByLabel('Nomor BPJS').fill('0001234599001');
	await doctor.getByLabel('Keluhan').fill('Keluhan uji E2E');
	await doctor.getByLabel('Diagnosis').fill(diagnosis);
	await doctor.getByLabel('Tindakan').fill('Tindakan awal E2E');
	await doctor.getByLabel('Catatan medis').fill('Catatan awal sintetis');
	await doctor.getByRole('button', { name: 'Simpan rekam medis' }).click();
	await expect(doctor).toHaveURL(/\/medical-records\/.+$/);
	await expect(doctor.getByRole('heading', { name: new RegExp(newPatientName) })).toBeVisible();
	const recordUrl = doctor.url();

	// UC-PR-01 & UC-PR-02: Nurse views record and records patient condition / vitals
	const nurse = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	await signIn(nurse, 'dina');
	await nurse.goto(recordUrl);
	await expect(nurse.getByText(diagnosis)).toBeVisible();
	await expect(nurse.getByRole('button', { name: 'Simpan perubahan' })).toHaveCount(0);
	await expect(nurse.getByRole('button', { name: 'Hapus rekam medis' })).toHaveCount(0);
	await nurse.getByText(/Tambah observasi/).click();
	await nurse.getByLabel('Gejala/kondisi').fill('Kondisi stabil pada pemeriksaan E2E');
	await nurse.getByLabel('Catatan keperawatan').fill('Tanda vital dalam batas pemantauan');
	await nurse.getByLabel('Suhu (°C)').fill('36.7');
	await nurse.getByLabel('Sistolik').fill('118');
	await nurse.getByLabel('Diastolik').fill('78');
	await nurse.getByLabel('Nadi (bpm)').fill('76');
	await nurse.getByLabel('Pernapasan (/menit)').fill('18');
	await nurse.getByLabel('Saturasi O₂ (%)').fill('99');
	await nurse.getByRole('button', { name: 'Simpan observasi' }).click();
	await expect(nurse.getByRole('status')).toContainText(/tersimpan/i);
	await expect(nurse.getByText('Kondisi stabil pada pemeriksaan E2E')).toBeVisible();
	await expect(nurse.getByText('118/78')).toBeVisible();

	// UC-DR-03 & UC-DR-04: Doctor updates then logically deletes the authored record
	await doctor.reload();
	await expect(doctor.getByText('Kondisi stabil pada pemeriksaan E2E')).toBeVisible();
	const updatedDiagnosis = `${diagnosis} (Diperbarui)`;
	await doctor.getByLabel('Diagnosis').fill(updatedDiagnosis);
	await doctor.getByRole('button', { name: 'Simpan perubahan' }).click();
	await expect(doctor.getByRole('status')).toContainText(/tersimpan/i);

	await doctor.getByRole('button', { name: 'Hapus rekam medis' }).click();
	await expect(doctor.getByRole('dialog')).toContainText('Konfirmasi hapus rekam medis');
	await doctor.getByRole('dialog').getByRole('button', { name: 'Hapus rekam medis' }).click();
	await expect(doctor).toHaveURL(/\/medical-records$/);
	await expect(doctor.getByText(updatedDiagnosis)).toHaveCount(0);
	await doctor.getByRole('button', { name: /Tambah rekam medis/ }).click();
	await expect(doctor.getByLabel('Pasien').locator('option', { hasText: newPatientName })).toHaveCount(1);

	expectNoBrowserErrors(doctor);
	expectNoBrowserErrors(nurse);
	await nurse.close();
	await doctor.close();
});
