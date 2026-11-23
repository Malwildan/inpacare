# Pengujian peramban InpaCare

Jalankan `npm run test:e2e` pada demo lokal dengan basis data sintetis yang sudah dimigrasi dan diisi. Alamat bawaan adalah `http://127.0.0.1:3000`. Contoh PowerShell berikut memasang Chromium di direktori lokal yang diabaikan Git.

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local/ms-playwright'
npx playwright install chromium
npm run test:e2e
```

Isi `INPACARE_TEST_URL` dengan origin yang dipakai peramban. Untuk Vite, gunakan alamat yang ditampilkan, biasanya `http://127.0.0.1:5173`. Jika menjalankan hasil build secara langsung, setel `ORIGIN` sesuai alamat peramban, termasuk port.

- Alur masuk mencakup isian wajib, kredensial ditolak, batas percobaan, sesi berakhir, pemulihan sesi koordinator dan Admisi, serta pencabutan sesi saat keluar.
- Pendaftaran pasien memeriksa nomor rekam medis, fokus, izin, pencarian, validasi dan draf pada lebar 390 piksel. Penempatan memeriksa kapasitas, versi terbaru, pembatalan dan riwayat.
- `npx playwright test tests/e2e/unified-admission.spec.ts --workers=1` menguji **Mulai rawat inap** dengan penempatan lama, penempatan baru, dan rekap tanpa ruang. Jika respons sukses sengaja diputus, pengiriman ulang isian yang sama tidak menggandakan rekap. Berkas tangkapan ada di `.local/evidence/issue-60-admission-*.png`.
- Alur rekap memeriksa penyimpanan dan pemuatan ulang detail, permintaan serta keputusan dokter. Alur tagihan memeriksa rincian, pembayaran, klaim dan riwayat.
- Papan tugas memeriksa tujuan seret, pembatalan di kolom asal, urutan, pindah lewat papan ketik dan sentuhan, fokus, penyimpanan tertunda, daftar kosong, filter, gagal muat, dan percobaan ulang. Saat batas percobaan masuk mengganggu rangkaian uji penuh, jalankan papan tugas pada instans sintetis tersendiri.
- Tangkapan layar dan jejak pengujian saat gagal tersedia di `test-results/`.

`npm run test:web:ux` menjalankan komponen nyata dengan layanan sintetis di Vite. Uji ini memerlukan Chromium lokal. Cakupannya meliputi notifikasi, fokus papan ketik, dialog, pembatalan perubahan, pengiriman yang tertunda, draf pada penolakan, tindakan kembali, filter, gerak terbatas, dan tata letak pada beberapa lebar. Gunakan Playwright terhadap aplikasi yang berjalan untuk memeriksa autentikasi, SSR, dan integrasi API.

Lihat [pengujian API](API_TESTS.md) untuk izin, konkurensi basis data, observasi, nominal tagihan, dan keputusan rekap. Gunakan data sintetis pada instans lokal.
