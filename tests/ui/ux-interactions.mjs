import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./fixtures/', import.meta.url));
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({
    configFile: false,
    root,
    publicDir: path.join(projectRoot, 'apps/web/static'),
    cacheDir: path.join(projectRoot, 'node_modules/.vite/ux-interactions'),
    plugins: [tailwindcss(), svelte({ configFile: false })],
    resolve: { alias: [
        { find: '$lib', replacement: path.join(projectRoot, 'apps/web/src/lib') },
        { find: '$app/state', replacement: path.join(root, 'state.js') },
        { find: '$app/navigation', replacement: path.join(root, 'navigation.js') }
    ] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [projectRoot] } }
});
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const pageErrors = [];
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.setDefaultTimeout(8000);
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 30000 });

    const trigger = page.getByRole('button', { name: 'Notifikasi', exact: true });
    await trigger.click();
    await expect(page.getByRole('status')).toHaveText('Memuat notifikasi…');
    await trigger.click();
    await trigger.click();
    assert.equal(await page.evaluate(() => window.callCount()), 1);
    await page.evaluate(() => window.releaseNotification());
    await expect(page.getByRole('alert')).toHaveText('Gagal sintetis');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.getByText('Sintetis', { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.callCount()), 2);
    await page.keyboard.press('Escape');

    const menu = page.getByRole('button', { name: 'Buka navigasi' });
    await menu.click();
    await expect(page.locator('#main-navigation .brand')).toBeFocused();
    await expect(page.locator('#main-navigation')).toHaveCSS('transition-duration', '0s');
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    const modalTrigger = page.getByRole('button', { name: 'Open test modal' });
    await modalTrigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#closes')).toHaveText('1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(modalTrigger).toBeFocused();

    const toggle = page.getByRole('button', { name: 'Tampilkan kata sandi' });
    const box = await toggle.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `Password toggle target: ${JSON.stringify(box)}`);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Sembunyikan kata sandi' })).toBeFocused();
    await expect(page.locator('.submit')).toHaveCSS('transition-duration', '0s');
    for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}px`);
        await page.screenshot({ path: path.join(projectRoot, '.local/evidence', `shadcn-shell-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    const navigation = page.getByRole('navigation', { name: 'Navigasi utama', exact: true });
    await expect(navigation.getByRole('link', { name: 'Tugas Perawatan', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Tagihan', exact: true })).toHaveCount(0);
    await page.evaluate(() => window.setRole('ADMISI'));
    await expect(navigation.getByRole('link', { name: 'Tagihan', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Tugas Perawatan', exact: true })).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Dashboard Siklus', exact: true })).toHaveCount(0);
    assert.deepEqual(pageErrors, []);
    console.log('PASS notifications pending/reopen/error/retry, mobile menu, modal focus, password toggle, keyboard and reduced motion');
} finally {
    await browser?.close();
    await server.close();
}
