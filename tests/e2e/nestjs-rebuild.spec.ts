import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const password = 'InpaCareDemo!2026';
const evidence = path.resolve('.local/nestjs-test');

test('doctor correction requires and submits its explanation', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('ID petugas').fill('hendra');
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/medical-records/MR-001');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Simpan perubahan' }) });
  await expect(form.getByLabel('Alasan koreksi')).toHaveAttribute('required', '');
  await form.getByLabel('Alasan koreksi').fill('Koreksi sumber sintetis pada E2E.');
  const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname === '/api/v1/medical-records/MR-001');
  await form.getByRole('button', { name: 'Simpan perubahan' }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().reason).toBe('Koreksi sumber sintetis pada E2E.');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catatan dokter' })).toBeVisible();
});

test('dashboard cycle filters are restored from and submitted to the server', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('ID petugas').fill('rina');
	await page.getByLabel('Kata sandi', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.goto('/dashboard?search=filter-e2e&status=pending_approval');
	await expect(page.getByRole('heading', { name: 'Dashboard Siklus Inpatient Care' })).toBeVisible();
	await expect(page.getByLabel('Cari nama atau nomor rekam medis')).toHaveValue('filter-e2e');
	await expect(page.getByLabel('Status')).toHaveValue('pending_approval');
	await page.getByRole('button', { name: 'Terapkan filter' }).click();
	await expect(page).toHaveURL(/search=filter-e2e.*status=pending_approval/);
});

test('Admisi can correct a bill line and verify a claim with changes retained after reload', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('ID petugas').fill('admisi');
	await page.getByLabel('Kata sandi', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/invoices$/);

	await page.getByRole('button', { name: /Buat tagihan/ }).click();
	const form = page.locator('.create-form');
	await form.getByLabel('Pasien').selectOption('PT-012');
	await form.getByLabel('Layanan').fill(`Rebuild E2E ${Date.now()}`);
	await form.getByLabel('Qty').fill('1');
	await form.getByLabel('Harga satuan (Rp)').fill('1250');
	const created = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/invoices');
	await form.getByRole('button', { name: 'Simpan tagihan' }).click();
	const invoiceId = (await (await created).json()).id as string;
	const row = page.getByRole('row').filter({ hasText: invoiceId });
	await row.getByRole('button', { name: 'Lihat detail' }).click();
	const detail = page.locator('.invoice-detail');
	const updatedDescription = `E2E dikoreksi ${Date.now()}`;
	const line = detail.locator('.line-editor').first();
	await line.getByLabel('Deskripsi').fill(updatedDescription);
	await line.getByLabel('Alasan').fill('Koreksi rincian pada pengujian rebuild.');
	await line.getByRole('button', { name: 'Simpan' }).click();
	await expect(detail).toContainText(updatedDescription);

	await detail.getByLabel('Hasil verifikasi klaim').fill('Ditolak');
	await detail.getByLabel('Keputusan klaim').selectOption('false');
	await detail.getByLabel('Alasan verifikasi').fill('Berkas sintetis belum lengkap.');
	await detail.getByRole('button', { name: 'Simpan verifikasi klaim' }).click();
	await expect(detail).toContainText('Ditolak');
	await page.reload();
	await page.getByRole('row').filter({ hasText: invoiceId }).getByRole('button', { name: 'Lihat detail' }).click();
	await expect(page.locator('.invoice-detail')).toContainText(updatedDescription);
	await expect(page.locator('.invoice-detail')).toContainText('Ditolak');
	await mkdir(evidence, { recursive: true });
	await page.screenshot({ path: path.join(evidence, 'e2e-invoice-detail.png'), fullPage: true, animations: 'disabled' });

	page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Hapus invoice uji' : undefined));
	await page.locator('.invoice-detail').getByRole('button', { name: 'Hapus tagihan' }).click();
	await expect(page.getByRole('status')).toContainText(/berhasil/i);
});

test('a nurse can edit and remove a room item and archive the empty room', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('ID petugas').fill('rina');
	await page.getByLabel('Kata sandi', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/rooms');
	const roomName = `Rebuild E2E ${Date.now()}`;
	await page.getByRole('button', { name: 'Tambah ruangan' }).click();
	const roomForm = page.locator('.form-panel form');
	await roomForm.getByLabel('Nama ruangan').fill(roomName);
	await roomForm.getByLabel('Tipe').fill('E2E');
	await roomForm.getByLabel('Kapasitas').fill('1');
	await roomForm.getByLabel('Tarif harian (Rp)').fill('0');
	await roomForm.getByRole('button', { name: 'Simpan ruangan' }).click();
	const roomRow = page.getByRole('row').filter({ hasText: roomName });
	await expect(roomRow).toBeVisible();
	await roomRow.getByRole('button', { name: 'Lihat' }).click();
	await roomRow.getByRole('button', { name: 'Item' }).click();
	const addItemForm = page.locator('.inline-edit').last();
	const itemName = `E2E item ${Date.now()}`;
	await addItemForm.getByLabel('Nama item').fill(itemName);
	await addItemForm.getByLabel('Kategori').fill('Perlengkapan');
	await addItemForm.getByLabel('Jumlah').fill('1');
	await addItemForm.getByLabel('Harga satuan').fill('100');
	await addItemForm.getByRole('button', { name: 'Tambah item' }).click();
	await expect(page.getByRole('status')).toContainText(/berhasil/i);
	await roomRow.getByRole('button', { name: 'Lihat' }).click();
	const itemRow = page.locator('.room-item').filter({ hasText: itemName });
	await expect(itemRow).toBeVisible();
	await mkdir(evidence, { recursive: true });
	await page.screenshot({ path: path.join(evidence, 'e2e-room-item.png'), fullPage: true, animations: 'disabled' });
	await itemRow.getByRole('button', { name: 'Ubah' }).click();
	const editItemForm = page.locator('.inline-edit').last();
	await editItemForm.getByLabel('Jumlah').fill('2');
	await editItemForm.getByRole('button', { name: 'Simpan item' }).click();
	await expect(page.locator('.room-item').filter({ hasText: itemName })).toContainText('2 ×');

	page.once('dialog', dialog => dialog.accept());
	await page.locator('.room-item').filter({ hasText: itemName }).getByRole('button', { name: 'Hapus' }).click();
	await expect(page.locator('.room-item').filter({ hasText: itemName })).toHaveCount(0);
	page.once('dialog', dialog => dialog.accept());
	await page.getByRole('row').filter({ hasText: roomName }).getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByRole('row').filter({ hasText: roomName })).toHaveCount(0);
});

test('Admisi can follow the restricted medical record projection without clinical text', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('ID petugas').fill('admisi');
	await page.getByLabel('Kata sandi', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/invoices$/);
	await page.getByRole('link', { name: 'Rekam Medis' }).click();
	await expect(page.getByRole('heading', { name: 'Daftar Rekam Medis' })).toBeVisible();
	await expect(page.getByText('Proyeksi administrasi baca saja')).toBeVisible();
	const firstRecord = page.locator('.data-table tbody tr').first();
	if (await firstRecord.getByText('Tidak ada rekam medis dalam cakupan Anda.').count()) test.skip();
	await firstRecord.getByRole('link', { name: 'Lihat detail' }).click();
	await expect(page.getByText('Proyeksi administrasi baca saja')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Catatan dokter' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Observasi keperawatan' })).toHaveCount(0);
	await mkdir(evidence, { recursive: true });
	await page.screenshot({ path: path.join(evidence, 'e2e-admission-projection.png'), fullPage: true, animations: 'disabled' });
});
