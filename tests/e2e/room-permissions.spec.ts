import { test, expect } from '@playwright/test';

test('a regular nurse can inspect rooms and facilities without master controls', async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('ID petugas').fill('dina');
  await page.getByLabel('Kata sandi', { exact: true }).fill('InpaCareDemo!2026');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/rooms');
  await expect(page.getByRole('heading', { name: 'Manajemen Ruangan' })).toBeVisible();
  const masterControls = page.getByRole('button', { name: /^(Tambah ruangan|Ubah|Hapus|Perlengkapan|Item)$/ });
  await expect(masterControls).toHaveCount(0);
  await page.getByRole('row').filter({ hasText: 'RG-001' }).getByRole('button', { name: 'Lihat', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Detail ruangan' });
  await expect(detail.getByText('Kapasitas', { exact: true })).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Perlengkapan dan fasilitas' })).toBeVisible();
  await expect(detail.getByRole('listitem').first()).toBeVisible();
  await expect(masterControls).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('form')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('room-nurse.png'), fullPage: true });
});
