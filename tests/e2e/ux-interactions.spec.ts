import { test, expect } from '@playwright/test';

test('notifications show truthful loading, retry and keyboard dismissal', async ({ page }) => {
 await page.goto('/login');
 await page.getByLabel('ID petugas').fill('rina');
 await page.getByLabel('Kata sandi', { exact: true }).fill('InpaCareDemo!2026');
 await page.getByRole('button', { name: 'Masuk', exact: true }).click();
 await expect(page).toHaveURL(/\/dashboard$/);
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 let requests = 0;
 await page.route('**/api/v1/notifications', async route => {
  requests++;
  if (requests === 1) {
   await gate;
   await route.fulfill({ status: 500, json: { error: { code: 'FAILED', message: 'Gagal memuat notifikasi.' } } });
  } else {
   await route.fulfill({ json: { items: [{ id: 'synthetic', cycleId: null, message: 'Notifikasi sintetis', readAt: null, createdAt: '2026-01-01T00:00:00Z' }] } });
  }
 });
 const trigger = page.getByRole('button', { name: 'Notifikasi', exact: true });
 await trigger.click();
 await expect(page.getByRole('status')).toContainText('Memuat notifikasi');
 await trigger.click();
 await trigger.click();
 await expect.poll(() => requests).toBe(1);
 release();
 await expect(page.getByRole('alert')).toContainText('Gagal memuat notifikasi.');
 await page.keyboard.press('Escape');
 await expect(trigger).toBeFocused();
 await trigger.click();
 await expect(page.getByText('Notifikasi sintetis')).toBeVisible();
 expect(requests).toBe(2);
 await page.keyboard.press('Escape');
 await page.setViewportSize({ width: 390, height: 844 });
 const menu = page.getByRole('button', { name: 'Buka navigasi' });
 await menu.click();
 await expect(page.locator('#main-navigation .brand')).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(menu).toBeFocused();
 await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('reduced motion and pointer targets retain keyboard feedback', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.goto('/login');
 const toggle = page.getByRole('button', { name: 'Tampilkan kata sandi' });
 const box = await toggle.boundingBox();
 expect(box!.width).toBeGreaterThanOrEqual(44);
 expect(box!.height).toBeGreaterThanOrEqual(44);
 await toggle.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('button', { name: 'Sembunyikan kata sandi' })).toBeFocused();
 await expect(page.locator('.submit')).toHaveCSS('transition-duration', '0s');
});
