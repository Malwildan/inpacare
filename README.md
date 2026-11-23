# InpaCare

[![CI](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml/badge.svg)](https://github.com/Malwildan/inpacare/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

InpaCare adalah aplikasi pengelolaan rawat inap berbasis **SvelteKit, NestJS, dan PostgreSQL**. Petugas dapat mengelola penempatan, tugas perawatan, rekam medis, keputusan dokter, dan tagihan sesuai hak akses.

Proyek pembelajaran ini menggunakan antarmuka berbahasa Indonesia dan data sintetis. Lihat [status proyek](docs/PROJECT_STATUS.md) untuk cakupan dan pekerjaan lanjutan.

**[Coba demo](https://inpacare.hailmary.my.id)** · **[Dokumentasi](docs/README.md)** · **[Berkontribusi](CONTRIBUTING.md)** · **[Laporkan masalah](https://github.com/Malwildan/inpacare/issues/new/choose)**

## Fitur

| Modul | Kegunaan |
| --- | --- |
| Data pasien | Admisi mendaftarkan pasien, menerima nomor rekam medis otomatis, dan mencari identitas pasien. |
| Ruang dan fasilitas | Lihat inventaris, biaya, kapasitas, dan perawat penanggung jawab. |
| Kalender penempatan | Pantau keterisian mingguan. Sistem memeriksa benturan jadwal dan kapasitas saat menyimpan penempatan. |
| Tugas perawatan | Koordinator menugaskan, mengalihkan, dan membatalkan tugas. Perawat memperbarui status. Riwayat mencatat perubahan. |
| Rekam medis | Dokter mencatat pemeriksaan. Perawat menambah observasi sesuai akses pasien. |
| Rekap rawat inap | Kelola rekap, ajukan perpanjangan atau pelepasan, dan terima notifikasi keputusan dokter. |
| Tagihan | Lihat nilai jaminan, total, pembayaran, dan riwayat perubahan. |

Autentikasi menggunakan hash Argon2, sesi di server, pemeriksaan Origin dan CSRF, serta izin berdasarkan peran. Perubahan yang dapat berbenturan memakai pemeriksaan versi dan transaksi basis data.

Sesi bertahan hingga 30 hari sejak masuk, termasuk saat peramban ditutup dan dibuka kembali. Sesi berakhir saat Anda memilih **Keluar**. Jika kuki dihapus, masuk kembali untuk melanjutkan. Pilih **Keluar** setelah memakai perangkat bersama. Sesi lama mengikuti masa berlaku awal hingga login berikutnya.

## Teknologi

| Lapisan | Teknologi |
| --- | --- |
| Frontend | Svelte 5, SvelteKit, TypeScript, adapter-node |
| Backend | Node.js 24.18+, NestJS, TypeORM |
| Basis data | PostgreSQL 16+ |
| Pengujian | TypeScript, uji unit, alur API dengan Python, dan Playwright |
| Pengoperasian | Layanan pengguna Linux atau paket Docker Compose |

SvelteKit merender halaman di server dan meneruskan permintaan `/api/v1` dari peramban ke NestJS melalui origin yang sama. PostgreSQL menyimpan data aplikasi. Kontrak API tersedia di [contracts/openapi.json](contracts/openapi.json).

## Mulai cepat

Klon repositori lalu pasang **Node.js 24.18+**, **Python 3**, dan PostgreSQL. Skrip Windows menyimpan data dan kredensial PostgreSQL di `.local/`. Aplikasi menggunakan Node.js.

```sh
git clone https://github.com/Malwildan/inpacare.git
cd inpacare
```

### Windows

Jalankan PowerShell dari akar repositori. Siapkan klaster PostgreSQL, bangun API dan aplikasi web, lalu jalankan migrasi sebelum memulai aplikasi.

```powershell
./scripts/setup-runtime.ps1
./scripts/database.ps1 -Action Start
npm ci
npm run build:api
npm run build
$env:DATABASE_URL = (Get-Content .local/database-url.txt -Raw).Trim()
npm run migration:run --workspace @inpacare/api
# Optional, synthetic demo data only:
$env:SEED_DEMO_PASSWORD = 'choose-a-demo-only-password'
npm run seed --workspace @inpacare/api
Remove-Item Env:SEED_DEMO_PASSWORD
./scripts/start.ps1 -SkipBuild
```

Buka **http://127.0.0.1:3000**. Jalankan migrasi dan pengisian data sebagai perintah terpisah. Lihat [penyiapan pengembangan](docs/development/GETTING_STARTED.md). Hentikan aplikasi dengan `./scripts/stop.ps1`.

### Linux, macOS, atau perangkat yang sudah disiapkan

Ikuti [panduan pengembangan](docs/development/GETTING_STARTED.md) untuk menjalankan NestJS dan SvelteKit. Untuk mengoperasikan server sendiri, gunakan [Linux dengan systemd](docs/deployment/NATIVE_HOSTING.md) atau [Docker Compose](docs/deployment/HOSTING.md).

## Akun demo

| ID petugas | Peran |
| --- | --- |
| `rina` | Koordinator perawat |
| `dina`, `bima` | Perawat penanggung jawab |
| `hendra`, `maya` | Dokter |
| `admisi` | Admisi dan tagihan |

Tentukan kata sandi khusus saat membuat akun demo. Perintah pengisian data hanya menerima tabel pengguna yang kosong. Demo publik memakai proksi HTTPS Cloudflare di **https://inpacare.hailmary.my.id** dan tersedia selama server aktif. Lihat [panduan pengoperasian Linux](docs/deployment/NATIVE_HOSTING.md).

## Struktur repositori

```text
.github/             CI, issue forms, and pull request template
apps/
  api/               NestJS API, PostgreSQL migrations, domain modules
  web/               SvelteKit routes, shared components, static assets
contracts/           OpenAPI specification and generated-type instructions
docs/
  development/       Setup, testing, and implementation conventions
  deployment/        Docker and native Linux hosting guides
  reference/         Domain API notes
  planning/          Requirements, decisions, and design references
  validation/        Shareable synthetic performance evidence
ops/                 Container definitions and systemd service templates
scripts/             Development, build, hosting, and test entry points
tests/
  api/               Real PostgreSQL/API workflow tests
  e2e/               Playwright user workflows
  performance/       Synthetic read smoke test
```

Direktori runtime, kredensial, basis data, bukti lokal, dan hasil kompilasi diabaikan Git. Salinan dokumen sumber privat disimpan di luar repositori publik.

## Pemeriksaan pengembangan

```sh
npm ci
npm run check
npm run build
npm run types:api
npm run check:api
npm run build:api
npm run test:api:unit
npm run test:api:integration
```

[Alur CI](.github/workflows/ci.yml) memeriksa aplikasi web, tipe API hasil generasi, uji unit dan integrasi NestJS, serta alur API pada PostgreSQL sementara. Build `main` yang lulus menerbitkan rilis Linux untuk [pembaruan demo otomatis](docs/deployment/CONTINUOUS_DELIVERY.md). Jalankan [uji API](docs/development/API_TESTS.md) dan [uji peramban](docs/development/BROWSER_TESTS.md) pada instans sintetis lokal.

## Berkontribusi

Baca [panduan kontribusi](CONTRIBUTING.md). Buat issue untuk perubahan izin atau aturan kerja, lalu kirim pull request yang terfokus dari fork Anda. [Status proyek](docs/PROJECT_STATUS.md) mencatat perilaku yang sudah tersedia dan pekerjaan lanjutan.

Laporkan kerentanan melalui [pelaporan privat GitHub](https://github.com/Malwildan/inpacare/security/advisories/new). Lihat [kebijakan keamanan](SECURITY.md).

## Cakupan dan lisensi

Proyek memakai data sintetis. Integrasi rumah sakit, pembayaran, penjamin, kesesuaian penuh dengan desain, dan sertifikasi operasional berada di luar cakupan. Gunakan demo publik hanya untuk data sintetis.

Kode aplikasi memakai [lisensi MIT](LICENSE). Font DM Sans memakai [SIL Open Font License](apps/web/static/fonts/OFL.txt). Dependensi dan materi desain mengikuti lisensi masing-masing.
