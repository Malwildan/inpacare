# Berkontribusi pada InpaCare

Perubahan yang terfokus memudahkan peninjauan. Anda dapat mulai dari dokumentasi, aksesibilitas, pengujian, atau perbaikan masalah.

## Memulai

1. Cari [issue](https://github.com/Malwildan/inpacare/issues) dan pull request yang sudah ada.
2. Buat issue untuk fitur baru atau perubahan izin, skema basis data, tagihan, penempatan, atau rekap. Jelaskan dampaknya bagi petugas dan pertimbangan yang perlu diputuskan.
3. Buat fork repositori, lalu buat cabang dari `main`.

   ```sh
   git clone https://github.com/YOUR_USERNAME/inpacare.git
   cd inpacare
   git switch -c fix/short-description
   ```

4. Ikuti [penyiapan pengembangan](docs/development/GETTING_STARTED.md) atau gunakan skrip Windows di [README](README.md).

## Lokasi perubahan

| Perubahan | Lokasi |
| --- | --- |
| API dan izin domain | `apps/api/src/` |
| Skema basis data | Migrasi TypeORM baru di `apps/api/src/infrastructure/database/migrations/` |
| Halaman dan komponen antarmuka | `apps/web/src/routes/` dan `apps/web/src/lib/` |
| Kontrak API | `contracts/openapi.json` |
| Alur uji API dan peramban | `tests/api/` dan `tests/e2e/` |
| Petunjuk penyiapan dan pengoperasian | `docs/development/` dan `docs/deployment/` |

Pertahankan lokasi skrip startup. Jika perlu memindahkannya, perbarui pemanggil dan panduan terkait. API dan web adalah aplikasi terpisah. Pindahkan modul domain jika tanggung jawabnya berubah.

Jalankan migrasi sebelum memulai API. Pengisian data demo memakai perintah terpisah dengan `SEED_DEMO_PASSWORD` dan tabel pengguna kosong.

## Aturan implementasi

- Ikuti pola kode sekitar dan batasi perubahan pada masalah yang dikerjakan.
- Periksa izin dan cakupan data pasien di API. Visibilitas kontrol di aplikasi hanya memandu petugas.
- Pertahankan versi, batas transaksi, dan riwayat perubahan.
- Kirim nominal sebagai teks desimal. Hitung total di server.
- Gunakan label Indonesia, akses papan ketik, dan pesan yang menyebut hasil serta tindakan pemulihan. Lihat [inventaris teks](docs/development/TEKS_INPACARE.md).
- Tambahkan migrasi baru untuk perubahan skema yang sudah diterapkan.
- Saat payload API berubah, perbarui OpenAPI, jalankan `npm run types:api`, lalu sertakan hasil `apps/web/src/lib/generated/api.d.ts` dalam commit.
- Gunakan data sintetis. Simpan kredensial, dump, rincian host, dan dokumen privat di luar Git dan tangkapan layar.

Lihat [aturan demo](docs/development/BUILD_CONTRACT.md) dan [referensi domain](docs/README.md#referensi) untuk perilaku saat ini. Dokumen perencanaan mencatat keputusan terdahulu.

## Periksa perubahan

Jalankan pemeriksaan yang sesuai dari akar repositori.

```sh
npm ci
npm run hooks:install
npm run check
npm run build
npm run types:api
git diff --exit-code -- apps/web/src/lib/generated/api.d.ts
npm run check:api
npm run build:api
npm run test:api:unit
npm run test:api:integration
```

Untuk perubahan API, jalankan [uji alur PostgreSQL](docs/development/API_TESTS.md) pada basis data sementara. Untuk perubahan antarmuka, jalankan [Playwright](docs/development/BROWSER_TESTS.md) pada instans sintetis lokal. Untuk dokumentasi, periksa tautan dan perintah.

CI menjalankan pemeriksaan web, build, pemeriksaan tipe API yang dihasilkan, uji NestJS, dan alur API. Pull request memilih pemeriksaan sesuai jalur yang berubah. Perubahan dokumentasi yang dikenal melewati pemeriksaan aplikasi dan jalur yang tidak dikenal menjalankan semua pemeriksaan. Push ke `main`, pengujian harian, dan pemicu manual menjalankan seluruh rangkaian serta mengisi cache. Jika perlindungan cabang masih memakai nama pemeriksaan Rust, ganti dengan nama pemeriksaan NestJS. Periksa logika pemilihan dengan `npm run test:ci`.

Jalankan `npm run hooks:install` untuk mengaktifkan hook pre-push di salinan ini. Hook memilih pemeriksaan spasi, Svelte, TypeScript, deklarasi API, build, dan uji API sesuai perubahan. Siapkan Node.js 24.18+ dan npm. Commit atau simpan perubahan terlacak sebelum push. Cabang baru dibandingkan dengan `origin/main`. Jika rujukan itu tidak tersedia, pemeriksaan mencakup seluruh pohon berkas. Uji peramban berjalan terpisah pada instans sintetis.

Hook memeriksa cabang yang sedang dibuka. Buka dan push cabang satu per satu jika ujung cabang berbeda. Pembaruan tag dan penghapusan cabang melewati pemeriksaan aplikasi.

## Kirim pull request

- Jelaskan masalah, perilaku setelah perubahan, dan pemeriksaan yang dijalankan.
- Tautkan issue. Sertakan tangkapan layar dengan data sintetis jika tampilan berubah.
- Catat dampak migrasi, pengoperasian, atau kompatibilitas.
- Sertakan perubahan yang terkait langsung dengan pekerjaan.

Pengelola meninjau pull request sebelum menggabungkannya. Tanggapi masukan dengan sopan dan fokus pada pekerjaan. Untuk kerentanan, ikuti [pelaporan privat](SECURITY.md).

Dengan mengirim kontribusi, Anda melisensikan karya asli Anda menurut [lisensi MIT](LICENSE). Sertakan hanya materi yang boleh Anda bagikan. Lisensi font dan materi pihak ketiga tetap berlaku.
