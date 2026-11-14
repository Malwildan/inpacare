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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'Asia/Jakarta' });
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

    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(server.resolvedUrls.local[0] + '?surface=calendar', { waitUntil: 'domcontentloaded' });
    const week = page.getByRole('table').first();
    await expect(week.getByRole('columnheader')).toHaveCount(8);
    await expect(week.getByRole('columnheader').last()).toContainText('8 Nov');
    await page.getByRole('button', { name: 'Minggu berikutnya', exact: true }).click();
    assert.equal(await page.evaluate(() => window.lastNavigation), '/calendar?from=2026-11-09');

    await page.getByRole('button', { name: 'Tempatkan pasien', exact: true }).click();
    const placementForm = page.getByRole('form', { name: 'Penempatan pasien', exact: true });
    await placementForm.getByRole('combobox', { name: 'Pasien', exact: true }).selectOption('patient');
    await placementForm.getByRole('combobox', { name: 'Ruangan', exact: true }).selectOption('room');
    await placementForm.getByLabel('Tanggal masuk').fill('2026-11-03');
    await placementForm.getByLabel('Tanggal keluar').fill('2026-11-04');
    await placementForm.getByRole('button', { name: 'Simpan penempatan', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Kapasitas telah berubah.');
    await expect(placementForm.getByLabel('Tanggal masuk')).toHaveValue('2026-11-03');
    await expect(placementForm.getByLabel('Tanggal keluar')).toHaveValue('2026-11-04');
    assert.deepEqual(await page.evaluate(() => window.calendarCreate), { patientId: 'patient', roomId: 'room', startsOn: '2026-11-03', endsOn: '2026-11-04' });
    await placementForm.getByRole('button', { name: 'Batal', exact: true }).click();

    for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Calendar page must contain schedule scrolling at ' + width + 'px');
        await page.screenshot({ path: path.join(projectRoot, '.local/evidence', 'shadcn-calendar-' + width + '.png'), fullPage: true, animations: 'disabled' });
    }
    const cancelTrigger = page.getByRole('row').filter({ hasText: 'RM-TEST' }).getByRole('button', { name: 'Batalkan', exact: true });
    await cancelTrigger.click();
    const cancellation = page.getByRole('alertdialog', { name: 'Batalkan penempatan?', exact: true });
    await cancellation.getByRole('button', { name: 'Kembali', exact: true }).click();
    await expect(cancellation).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.calendarCancellations.length), 0);
    await expect(cancelTrigger).toBeFocused();
    await cancelTrigger.click();
    await cancellation.getByRole('button', { name: 'Konfirmasi pembatalan', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(cancellation).toBeVisible();
    await page.evaluate(() => window.rejectCancellation());
    await expect(cancellation.getByRole('alert')).toContainText('Versi penempatan telah berubah.');
    assert.deepEqual(await page.evaluate(() => window.calendarCancellations), [{ id: 'placement', expectedVersion: 7 }]);
    await cancellation.getByRole('button', { name: 'Konfirmasi pembatalan', exact: true }).click();
    await expect(cancellation).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'RM-TEST' })).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.calendarCancellations), [{ id: 'placement', expectedVersion: 7 }, { id: 'placement', expectedVersion: 7 }]);
    assert.deepEqual(pageErrors, []);

    await page.goto(server.resolvedUrls.local[0] + '?surface=dashboard', { waitUntil: 'domcontentloaded' });
    for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Dashboard page overflow at ' + width + 'px');
        await page.screenshot({ path: path.join(projectRoot, '.local/evidence', 'shadcn-dashboard-' + width + '.png'), fullPage: true, animations: 'disabled' });
    }
    await page.getByLabel('Cari nama atau nomor rekam medis').fill(' filter ');
    await page.getByRole('button', { name: 'Terapkan filter', exact: true }).click();
    assert.equal(await page.evaluate(() => window.lastNavigation), '/dashboard?search=filter');
    const addCycle = page.getByRole('button', { name: 'Tambah rekap pasien', exact: true });
    await addCycle.click();
    const createCycle = page.getByRole('dialog', { name: 'Tambah rekap pasien', exact: true });
    await createCycle.getByRole('combobox', { name: 'Pasien terdaftar', exact: true }).selectOption('new-patient');
    await createCycle.getByRole('combobox', { name: 'Dokter penanggung jawab', exact: true }).selectOption('doctor');
    await createCycle.getByRole('button', { name: 'Simpan rekap', exact: true }).click();
    await expect(createCycle.getByRole('alert')).toContainText('Rekap gagal tersimpan.');
    await expect(createCycle.getByRole('combobox', { name: 'Pasien terdaftar', exact: true })).toHaveValue('new-patient');
    assert.deepEqual(await page.evaluate(() => window.cycleCreate), { patientId: 'new-patient', doctorId: 'doctor', placementId: null });
    await createCycle.getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(createCycle).toHaveCount(0);
    await expect(addCycle).toBeFocused();

    await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
    const detailCycle = page.getByRole('dialog', { name: 'Detail siklus inpatient care', exact: true });
    const deleteCycle = detailCycle.getByRole('button', { name: 'Hapus rekap', exact: true });
    await deleteCycle.click();
    const removeCycle = page.getByRole('dialog', { name: 'Hapus rekap pending?', exact: true });
    await removeCycle.getByRole('button', { name: 'Batal', exact: true }).click();
    await expect(removeCycle).toHaveCount(0);
    await expect(deleteCycle).toBeFocused();
    assert.equal(await page.evaluate(() => window.cycleRemovals.length), 0);
    await deleteCycle.click();
    const cycleReason = removeCycle.getByLabel('Alasan penghapusan');
    await cycleReason.fill('   ');
    await removeCycle.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
    await expect(removeCycle.getByRole('alert')).toContainText('Alasan penghapusan wajib diisi.');
    assert.equal(await page.evaluate(() => window.cycleRemovals.length), 0);
    await cycleReason.fill('Koreksi data ganda');
    await removeCycle.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(removeCycle).toBeVisible();
    await page.evaluate(() => window.rejectCycleRemoval());
    await expect(removeCycle.getByRole('alert')).toContainText('Versi rekap berubah.');
    await expect(cycleReason).toHaveValue('Koreksi data ganda');
    await removeCycle.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
    await expect(removeCycle).toHaveCount(0);
    await expect(detailCycle).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.cycleRemovals), [
        { id: 'cycle', expectedVersion: 11, reason: 'Koreksi data ganda' },
        { id: 'cycle', expectedVersion: 11, reason: 'Koreksi data ganda' }
    ]);
    assert.deepEqual(pageErrors, []);
    await page.goto(server.resolvedUrls.local[0] + '?surface=billing', { waitUntil: 'domcontentloaded' });
    const invoiceList = page.getByRole('region', { name: 'Daftar tagihan', exact: true });
    await invoiceList.getByLabel('Cari pasien / nomor tagihan').fill('tidak cocok');
    await expect(invoiceList.getByText('Belum ada tagihan yang cocok.')).toBeVisible();
    await invoiceList.getByLabel('Cari pasien / nomor tagihan').fill('RM-TEST');
    await expect(invoiceList.getByRole('row').filter({ hasText: 'RM-TEST' })).toHaveCount(1);
    await invoiceList.getByRole('combobox', { name: 'Status', exact: true }).selectOption('paid');
    await expect(invoiceList.getByText('Belum ada tagihan yang cocok.')).toBeVisible();
    await invoiceList.getByRole('combobox', { name: 'Status', exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Buat tagihan', exact: true }).click();
    const invoiceForm = page.getByRole('form', { name: 'Buat tagihan baru', exact: true });
    await invoiceForm.getByRole('combobox', { name: 'Pasien', exact: true }).selectOption('patient');
    await invoiceForm.getByRole('combobox', { name: 'Penempatan', exact: true }).selectOption('placement');
    await invoiceForm.getByLabel('Layanan', { exact: true }).fill('Layanan Uji');
    await invoiceForm.getByLabel('Qty', { exact: true }).fill('2');
    await invoiceForm.getByLabel('Harga satuan (Rp)', { exact: true }).fill('1234.56');
    await invoiceForm.getByLabel('Jumlah jaminan BPJS (Rp)').fill('100.25');
    for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Invoice creation overflow at ' + width + 'px');
        await page.screenshot({ path: path.join(projectRoot, '.local/evidence', 'shadcn-billing-create-' + width + '.png'), fullPage: true, animations: 'disabled' });
    }
    await invoiceForm.getByRole('button', { name: 'Simpan tagihan', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Tagihan gagal tersimpan.');
    await expect(invoiceForm.getByLabel('Harga satuan (Rp)', { exact: true })).toHaveValue('1234.56');
    await expect(invoiceForm.getByLabel('Layanan', { exact: true })).toHaveValue('Layanan Uji');
    assert.deepEqual(await page.evaluate(() => window.invoiceCreate), { patientId: 'patient', placementId: 'placement', coveredAmount: '100.25', lines: [{ description: 'Layanan Uji', quantity: 2, unitPrice: '1234.56' }] });
    await invoiceForm.getByRole('button', { name: 'Batal', exact: true }).click();
    await invoiceList.getByRole('button', { name: 'Lihat detail', exact: true }).click();
    const invoiceDetail = page.getByRole('region', { name: 'Rincian tagihan', exact: true });
    await expect(invoiceDetail.getByText('Tagihan dibuat · Admisi Uji')).toBeVisible();
    await expect(invoiceDetail.getByText('Dibayar pasien:', { exact: false })).toContainText('200.000,25');
    for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Invoice detail overflow at ' + width + 'px');
        await page.screenshot({ path: path.join(projectRoot, '.local/evidence', 'shadcn-billing-detail-' + width + '.png'), fullPage: true, animations: 'disabled' });
    }
    assert.deepEqual(pageErrors, []);
    const deleteLine = invoiceDetail.locator('form.line-editor').first().getByRole('button', { name: 'Hapus', exact: true });
    await deleteLine.click();
    const removeLine = page.getByRole('dialog', { name: 'Hapus rincian tagihan?', exact: true });
    await expect(removeLine).toBeVisible();
    await removeLine.getByLabel('Alasan penghapusan').fill('Koreksi duplikasi');
    await page.keyboard.press('Escape');
    await expect(removeLine).toHaveCount(0);
    await expect(deleteLine).toBeFocused();
    assert.deepEqual(await page.evaluate(() => window.billingWrites), []);
    await deleteLine.click();
    await expect(removeLine.getByLabel('Alasan penghapusan')).toHaveValue('Koreksi duplikasi');
    await removeLine.getByLabel('Alasan penghapusan').fill('   ');
    await removeLine.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
    await expect(removeLine.getByRole('alert')).toContainText('Alasan penghapusan wajib diisi.');
    assert.deepEqual(await page.evaluate(() => window.billingWrites), []);
    await removeLine.getByLabel('Alasan penghapusan').fill('Koreksi duplikasi');
    await removeLine.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(removeLine).toBeVisible();
    await page.evaluate(() => window.rejectLineRemoval());
    await expect(removeLine.getByRole('alert')).toContainText('Versi rincian berubah.');
    await expect(removeLine.getByLabel('Alasan penghapusan')).toHaveValue('Koreksi duplikasi');
    await removeLine.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
    await expect(removeLine).toHaveCount(0);
    await expect(invoiceDetail.locator('form.line-editor')).toHaveCount(1);
    assert.deepEqual(await page.evaluate(() => window.billingWrites), [
        { action: 'deleteLine', id: 'invoice', lineId: 'line', expectedVersion: 13, reason: 'Koreksi duplikasi' },
        { action: 'deleteLine', id: 'invoice', lineId: 'line', expectedVersion: 13, reason: 'Koreksi duplikasi' }
    ]);
    const remainingLine = invoiceDetail.locator('form.line-editor');
    await remainingLine.getByLabel('Harga satuan', { exact: true }).fill('123.45');
    await remainingLine.getByLabel('Alasan', { exact: true }).fill('Koreksi harga');
    await remainingLine.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Rincian gagal tersimpan.');
    await expect(remainingLine.getByLabel('Harga satuan', { exact: true })).toHaveValue('123.45');
    assert.deepEqual(await page.evaluate(() => window.billingWrites.at(-1)), { action: 'editLine', id: 'invoice', lineId: 'other-line', expectedVersion: 13, reason: 'Koreksi harga', kind: 'item', roomItemId: null, description: 'Perlengkapan', quantity: 1, unitPrice: '123.45' });
    await invoiceDetail.getByRole('button', { name: 'Ubah tagihan', exact: true }).click();
    const invoiceEditor = invoiceDetail.locator('form').filter({ has: page.getByRole('button', { name: 'Simpan perubahan', exact: true }) });
    await invoiceEditor.getByLabel('Harga satuan', { exact: true }).fill('1234.56');
    await invoiceEditor.getByLabel('Jumlah jaminan BPJS (Rp)').fill('100.25');
    await invoiceEditor.getByLabel('Alasan perubahan').fill('Koreksi biaya');
    await invoiceEditor.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Versi tagihan berubah.');
    await expect(invoiceEditor.getByLabel('Alasan perubahan')).toHaveValue('Koreksi biaya');
    assert.deepEqual(await page.evaluate(() => window.billingWrites.at(-1)), { action: 'payment', id: 'invoice', expectedVersion: 13, reason: 'Koreksi biaya', coveredAmount: '100.25', lines: [{ roomItemId: null, kind: 'item', description: 'Perlengkapan', quantity: 1, unitPrice: '1234.56' }] });
    await invoiceEditor.getByRole('button', { name: 'Batal', exact: true }).click();
    await invoiceDetail.getByLabel('Hasil verifikasi klaim').fill('Ditolak');
    await invoiceDetail.getByLabel('Alasan verifikasi').fill('Berkas sintetis');
    await invoiceDetail.getByRole('button', { name: 'Simpan verifikasi klaim', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Klaim gagal tersimpan.');
    assert.deepEqual(await page.evaluate(() => window.billingWrites.at(-1)), { action: 'claim', id: 'invoice', expectedVersion: 13, reason: 'Berkas sintetis', result: 'Ditolak', verified: false });
    const paymentTrigger = invoiceList.getByRole('button', { name: 'Ubah status', exact: true });
    await paymentTrigger.click();
    const paymentDialog = page.getByRole('dialog', { name: 'Ubah status pembayaran', exact: true });
    await paymentDialog.getByLabel('Alasan perubahan').fill('Pembayaran tercatat');
    await page.keyboard.press('Escape');
    await expect(paymentTrigger).toBeFocused();
    const writesBeforePayment = await page.evaluate(() => window.billingWrites.length);
    await paymentTrigger.click();
    await expect(paymentDialog.getByLabel('Alasan perubahan')).toHaveValue('Pembayaran tercatat');
    await paymentDialog.getByRole('button', { name: 'Simpan status', exact: true }).click();
    await expect(paymentDialog.getByRole('alert')).toContainText('Versi tagihan berubah.');
    await expect(paymentDialog.getByLabel('Alasan perubahan')).toHaveValue('Pembayaran tercatat');
    assert.equal(await page.evaluate(() => window.billingWrites.length), writesBeforePayment + 1);
    assert.deepEqual(await page.evaluate(() => window.billingWrites.at(-1)), { action: 'payment', id: 'invoice', expectedVersion: 13, reason: 'Pembayaran tercatat', status: 'paid' });
    await paymentDialog.getByRole('button', { name: 'Batal', exact: true }).click();
    await invoiceDetail.getByRole('button', { name: 'Hapus tagihan', exact: true }).click();
    const removeInvoice = page.getByRole('dialog', { name: 'Hapus tagihan?', exact: true });
    await removeInvoice.getByLabel('Alasan penghapusan').fill('Koreksi tagihan');
    await removeInvoice.getByRole('button', { name: 'Batal', exact: true }).click();
    await invoiceDetail.getByRole('button', { name: 'Hapus tagihan', exact: true }).click();
    await expect(removeInvoice.getByLabel('Alasan penghapusan')).toHaveValue('Koreksi tagihan');
    await removeInvoice.getByRole('button', { name: 'Ya, hapus', exact: true }).click();
    await expect(removeInvoice).toHaveCount(0);
    await expect(invoiceDetail).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.billingWrites.at(-1)), { action: 'deleteInvoice', id: 'invoice', expectedVersion: 13, reason: 'Koreksi tagihan' });
    assert.deepEqual(pageErrors, []);
    await page.goto(server.resolvedUrls.local[0] + '?surface=tasks', { waitUntil: 'domcontentloaded' });
    await page.locator('#task-task').click();
    const taskDetail = page.getByRole('dialog', { name: 'Tugas Uji', exact: true });
    await taskDetail.getByRole('button', { name: 'Hapus logis dengan alasan', exact: true }).click();
    const removeTask = page.getByRole('dialog', { name: 'Hapus tugas?', exact: true });
    await removeTask.getByLabel('Alasan penghapusan').fill('Koreksi tugas ganda');
    await removeTask.getByRole('button', { name: 'Batal', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.taskWrites), []);
    await taskDetail.getByRole('button', { name: 'Hapus logis dengan alasan', exact: true }).click();
    await expect(removeTask.getByLabel('Alasan penghapusan')).toHaveValue('Koreksi tugas ganda');
    await removeTask.getByRole('button', { name: 'Konfirmasi hapus', exact: true }).click();
    await expect(removeTask.getByRole('alert')).toContainText('Penghapusan gagal tersimpan.');
    await expect(removeTask.getByLabel('Alasan penghapusan')).toHaveValue('Koreksi tugas ganda');
    assert.deepEqual(await page.evaluate(() => window.taskWrites), [{ action: 'remove', id: 'task', expectedVersion: 17, reason: 'Koreksi tugas ganda' }]);
    await removeTask.getByRole('button', { name: 'Batal', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#task-task')).toBeFocused();
    const taskBoard = page.getByRole('region', { name: 'Papan tugas perawatan', exact: true });
    const todo = taskBoard.getByRole('region', { name: 'Belum Dikerjakan', exact: true });
    await expect(todo.locator('.column-heading > span')).toHaveText('2 / 3');
    await todo.getByRole('button', { name: 'Muat lebih banyak', exact: true }).click();
    await expect(todo.locator('.column-heading > span')).toHaveText('3 / 3');
    assert.equal(await page.evaluate(() => window.taskReads.at(-1).offset), 2);
    await page.getByRole('button', { name: 'Buat tugas', exact: true }).click();
    const taskForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Simpan tugas', exact: true }) });
    await taskForm.getByLabel('Penempatan pasien').selectOption('placement');
    await taskForm.getByLabel('Perawat PIC').selectOption('nurse');
    await taskForm.getByLabel('Judul', { exact: true }).fill('Tugas Baru');
    await taskForm.getByLabel('Waktu mulai').fill('2026-11-02T08:30');
    await taskForm.getByLabel('Waktu selesai').fill('2026-11-02T09:30');
    await taskForm.getByRole('button', { name: 'Simpan tugas', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Tugas gagal tersimpan.');
    await expect(taskForm.getByLabel('Judul', { exact: true })).toHaveValue('Tugas Baru');
    assert.deepEqual(await page.evaluate(() => window.taskCreate), { patientId: 'patient', placementId: 'placement', picId: 'nurse', title: 'Tugas Baru', description: '', notes: '', priority: 'normal', startsAt: '2026-11-02T01:30:00.000Z', endsAt: '2026-11-02T02:30:00.000Z' });
    await taskForm.getByRole('button', { name: 'Batal', exact: true }).click();
    const taskCard = taskBoard.getByRole('article').filter({ hasText: 'Tugas Uji' });
    await taskCard.getByRole('button', { name: 'Pindahkan', exact: true }).click();
    const moveTask = page.getByRole('dialog', { name: 'Pindahkan Tugas Uji', exact: true });
    await moveTask.getByLabel('Status tujuan').selectOption('in_progress');
    await moveTask.getByRole('button', { name: 'Konfirmasi pindahkan', exact: true }).click();
    await expect(taskCard.getByRole('status')).toHaveText('Menyimpan...');
    await expect(moveTask.getByRole('button', { name: 'Konfirmasi pindahkan', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(moveTask).toHaveCount(0);
    await expect(taskCard.getByRole('status')).toHaveText('Menyimpan...');
    await page.evaluate(() => window.rejectTaskMove());
    await expect(page.getByRole('alert')).toContainText('Tugas berubah.');
    await expect(todo.getByRole('article').filter({ hasText: 'Tugas Uji' })).toBeVisible();
    await taskCard.getByRole('button', { name: 'Pindahkan', exact: true }).click();
    await moveTask.getByLabel('Status tujuan').selectOption('in_progress');
    await moveTask.getByRole('button', { name: 'Konfirmasi pindahkan', exact: true }).click();
    await expect(moveTask).toHaveCount(0);
    await expect(page.locator('#task-task')).toBeFocused();
    await expect(taskBoard.getByRole('region', { name: 'Sedang Dikerjakan', exact: true }).getByRole('article').filter({ hasText: 'Tugas Uji' })).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.taskWrites.filter(write => write.action === 'move')), [
        { action: 'move', id: 'task', expectedVersion: 17, status: 'in_progress', beforeTaskId: null },
        { action: 'move', id: 'task', expectedVersion: 17, status: 'in_progress', beforeTaskId: null }
    ]);
    await page.locator('#task-task').click();
    await taskDetail.getByRole('button', { name: 'Batalkan dengan alasan', exact: true }).click();
    await moveTask.getByLabel('Alasan pembatalan').fill('Pembatalan sintetis');
    await moveTask.getByRole('button', { name: 'Batal', exact: true }).click();
    await expect(taskDetail.getByRole('button', { name: 'Batalkan dengan alasan', exact: true })).toBeFocused();
    await taskDetail.getByRole('button', { name: 'Batalkan dengan alasan', exact: true }).click();
    await expect(moveTask.getByLabel('Alasan pembatalan')).toHaveValue('Pembatalan sintetis');
    await moveTask.getByRole('button', { name: 'Konfirmasi pindahkan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.taskWrites.at(-1)), { action: 'move', id: 'task', expectedVersion: 18, status: 'cancelled', beforeTaskId: null, reason: 'Pembatalan sintetis' });
    await page.evaluate(() => window.setTaskCoordinator(false));
    await expect(taskBoard.getByRole('article').filter({ hasText: 'Tugas Perawat Lain' }).getByRole('button', { name: 'Pindahkan', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Buat tugas', exact: true })).toHaveCount(0);
    for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Task board must contain scrolling at ' + width + 'px');
        await page.screenshot({ path: path.join(projectRoot, '.local/evidence', 'shadcn-tasks-' + width + '.png'), fullPage: true, animations: 'disabled' });
    }
    assert.deepEqual(pageErrors, []);
    console.log('PASS shell, calendar, dashboard, billing and tasks: responsive layouts, roles, payloads, drafts, dialogs, focus and conflict recovery');
} finally {
    await browser?.close();
    await server.close();
}
