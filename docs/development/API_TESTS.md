# Pengujian alur API

`tests/api/test_workflows.py` menguji NestJS dan PostgreSQL melalui HTTP. Pengujian masuk dengan akun yang memakai Argon2, menyimpan kuki, mengirim header CSRF dan Origin, lalu membaca kembali data yang tersimpan.

Cakupan meliputi sesi dan izin, pemulihan sesi dari kuki, pencabutan sesi saat keluar, penugasan dan status tugas, konflik versi dan riwayat, pembatalan dan penghapusan, paginasi, akses rekam medis, biaya fasilitas, kapasitas ruang, keputusan dokter, notifikasi, total tagihan, serta rekap dengan atau tanpa penempatan.

Alur ini mengubah data dan menuntaskan rekap. Jalankan pada basis data sementara baru berisi data sintetis.

`npm run test:api:integration` menjalankan uji repositori Node/PostgreSQL. Isi `INPACARE_TEST_DATABASE_ADMIN_URL` dengan koneksi admin ke PostgreSQL lokal yang dapat membuat dan menghapus basis data sementara. CI memakai layanan `nest_test` baru. Gunakan server lokal khusus pengujian.

## Skrip Windows

Setelah memasang [runtime lokal](RUNTIME_SETUP.md), jalankan perintah berikut.

```powershell
./scripts/test-api.ps1
```

Skrip membangun API, membuat basis data uji, menjalankan migrasi dan pengisian data, lalu memulai API di port 8081. Hanya origin pengujian yang dipercaya. Setelah API siap, skrip menjalankan uji Python, menghentikan prosesnya, dan menghapus basis data uji. Log API tetap di `.local/`. Pastikan port 8081 tersedia. Gunakan `SEED_DEMO_PASSWORD` untuk mengganti kata sandi sintetis bawaan.

## Linux dengan systemd

Jalankan perintah setelah runtime dan hasil build Node.js tersedia.

```sh
python3 scripts/test-native-host.py
```

Skrip memakai konfigurasi privat di memori untuk membuat basis data uji, menjalankan migrasi dan pengisian data, serta memulai API pada port 8081. Basis data sementara dihapus setelah pengujian.

## Penyiapan manual atau CI

Siapkan basis data terpisah milik peran aplikasi. Bangun API dan jalankan migrasi, lalu isi data uji sintetis dengan kata sandi khusus jika diperlukan.

```sh
npm run build:api
npm run migration:run --workspace @inpacare/api
SEED_DEMO_PASSWORD='test-only-password' npm run seed --workspace @inpacare/api
```

Jalankan API dengan `DATABASE_URL`, `API_BIND=127.0.0.1:8081`, dan `TRUSTED_ORIGINS=http://127.0.0.1:8081`. Tunggu hingga `/health` berhasil, lalu jalankan uji.

```sh
INPACARE_TEST_URL=http://127.0.0.1:8081/api/v1 \
  python3 -m unittest discover -s tests/api -v
```

[Alur CI](../../.github/workflows/ci.yml) menyiapkan layanan PostgreSQL baru untuk setiap pekerjaan. Jalankan migrasi dan pengisian data secara terpisah sebelum memulai API.
