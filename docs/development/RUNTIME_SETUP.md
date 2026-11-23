# Penyiapan runtime Windows

Penyiapan menyimpan perangkat PostgreSQL, basis data, koneksi, log, dan kredensial di `.local/` yang diabaikan Git. PostgreSQL hanya menerima koneksi loopback dan berjalan tanpa layanan Windows. Pasang Node.js 24.18+ secara terpisah.

## Pasang dan mulai

Jalankan PowerShell dari akar proyek.

```powershell
./scripts/setup-runtime.ps1
./scripts/database.ps1 -Action Start
npm ci
npm run build:api
npm run build
$env:DATABASE_URL = (Get-Content .local/database-url.txt -Raw).Trim()
npm run migration:run --workspace @inpacare/api
```

Pemasang mengunduh [arsip PostgreSQL 17 untuk Windows dari EDB](https://www.enterprisedb.com/download-postgresql-binaries) ke `.local/downloads/` dan mengekstrak perangkatnya ke `.local/postgresql/`. Pada penggunaan pertama, `database.ps1` membuat klaster, basis data, dan peran. URL koneksi aplikasi disimpan di `.local/database-url.txt`.

```text
postgres://inpacare:inpacare@127.0.0.1:55432/inpacare
```

Gunakan kata sandi contoh hanya untuk pengembangan dengan data sintetis. PostgreSQL menggunakan `127.0.0.1:55432`. Kata sandi superuser lokal disimpan di `.local/postgres-superuser-password.txt` dan aplikasi memakai akun basis data terpisah.

Untuk membuat akun dan data demo, jalankan pengisian setelah migrasi. Tabel pengguna harus kosong.

```powershell
$env:SEED_DEMO_PASSWORD = 'choose-a-demo-only-password'
npm run seed --workspace @inpacare/api
Remove-Item Env:SEED_DEMO_PASSWORD
```

Jalankan `./scripts/start.ps1 -SkipBuild` setelah migrasi dan pengisian data selesai.

## Kelola basis data lokal

```powershell
./scripts/database.ps1 -Action Status
./scripts/database.ps1 -Action Stop
./scripts/database.ps1 -Action Start
```

`Stop` hanya menghentikan klaster di `.local/postgres-data`. Jalankan `./scripts/test-api.ps1` untuk menguji API pada basis data sementara yang dihapus setelah pengujian.

## Cakupan

Gunakan runtime lokal untuk pengembangan dan peninjauan proyek dengan data sintetis. Simpan informasi pasien dan kredensial produksi di luar demo.
