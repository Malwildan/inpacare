# Status proyek

InpaCare mendukung alur rawat inap untuk pembelajaran dengan data sintetis. Aplikasi web dirender di server dan menampilkan data serta tindakan sesuai izin petugas.

## Cakupan saat ini

- Akses petugas memakai Argon2, sesi di server, pencabutan sesi saat keluar, peran petugas, serta pemeriksaan Origin dan CSRF.
- Admisi dapat mendaftarkan pasien, menerima nomor rekam medis otomatis, dan mencari identitas.
- Ruang rawat inap mencakup daftar, detail, fasilitas, biaya, tarif per hari, kapasitas, dan penanggung jawab. Koordinator dapat mengelola ruang dan fasilitas.
- Kalender menampilkan keterisian mingguan. Perawat membuat penempatan awal. Koordinator dapat mengubah atau membatalkan penempatan sesuai aturan rekap dan tugas. Riwayat mencatat perubahan.
- Tugas perawatan mencakup penugasan, status, catatan, pengalihan, pembatalan, penghapusan dari papan, dan riwayat. Penanggung jawab lama kehilangan akses setelah pengalihan.
- Rekam medis mencakup catatan dokter yang dapat dikoreksi dengan versi dan observasi perawat. Admisi hanya menerima data administratif.
- Rekap rawat inap mencakup penempatan saat dibuat atau sesudahnya, mulai perawatan, pengajuan perpanjangan atau pelepasan, keputusan dokter, dan notifikasi.
- Admisi mengelola tagihan dan rincian, nilai jaminan, pembayaran, hasil pemeriksaan klaim, serta riwayat. Nilai disimpan sebagai desimal. Pembayaran dan verifikasi layanan penjamin di luar aplikasi tetap dilakukan terpisah.

Lihat [aturan demo](development/BUILD_CONTRACT.md), [referensi domain](README.md#referensi), dan [inventaris teks](development/TEKS_INPACARE.md).

## Validation evidence

The implementation was checked on 2026-10-29 with 4 Rust unit tests, 11 PostgreSQL/API workflows, 4 Playwright workflows, frontend type checking, and production builds. The Linux executable and native host were also checked with isolated API tests, HTTP/SSR role checks, and database persistence across service restart. These are historical results; use the [current CI run](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml) for the published revision.

The retained [synthetic read smoke](validation/performance-smoke.json) covers 60 loopback reads with 5 concurrent workers. It is not a sustained capacity, field Web Vitals, or production-readiness measurement. Private machine and account diagnostics are excluded from public source.

## Pekerjaan lanjutan

- Periksa kesesuaian dengan keadaan desain dan perluas cakupan pengujian responsif serta aksesibilitas.
- Kalender bulanan.
- Administrasi dan pemulihan akun, kebijakan retensi, dan pengiriman ulang yang aman pada operasi pembuatan lain.
- Integrasi eksternal dan alur klaim lanjutan jika sudah ditetapkan.
- Pengujian beban berkelanjutan, latihan pemulihan cadangan, dan kontrol pengoperasian.

Bahas cakupan serta kriteria penerimaan melalui [usulan fitur](https://github.com/Malwildan/inpacare/issues/new/choose) sebelum mengubah aturan domain.
