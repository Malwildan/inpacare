# Penyiapan pengembangan

Jalankan perintah dari akar repositori. Gunakan basis data PostgreSQL lokal dan data sintetis. Jalankan uji yang mengubah data pada basis data sementara.

## Prasyarat

- Node.js 24.18+ dan npm. Versi mayor yang disarankan tercantum di `.nvmrc`.
- PostgreSQL 16 atau lebih baru, dipasang lokal atau dijalankan melalui Docker.
- Python 3 untuk alur API dan Chromium dari Playwright untuk alur peramban.

Di Windows, `scripts/start.ps1` hanya menjalankan aplikasi dan proses PostgreSQL lokal yang dikelolanya. Lihat [penyiapan runtime Windows](RUNTIME_SETUP.md).

## Siapkan API dan aplikasi web secara manual

Pasang dependensi dan salin templat lingkungan lokal yang diabaikan Git.

```sh
npm ci
cp .env.example .env
```

Muat sendiri variabel dari `.env` ke shell. Contoh berikut membuat kontainer PostgreSQL untuk data sintetis jika port 55432 tersedia.

```sh
docker run --name inpacare-dev-db \
  -e POSTGRES_USER=inpacare \
  -e POSTGRES_PASSWORD=inpacare \
  -e POSTGRES_DB=inpacare \
  -p 127.0.0.1:55432:5432 \
  -d postgres:17-alpine
```

Muat variabel lingkungan, bangun API, lalu jalankan migrasi sebelum memulai aplikasi.

```sh
set -a
. ./.env
set +a
npm run build:api
npm run migration:run --workspace @inpacare/api
```

Untuk membuat akun demo sintetis, tentukan kata sandi khusus demo dan jalankan perintah pengisian data pada basis data dengan tabel pengguna kosong.

```sh
export SEED_DEMO_PASSWORD='choose-a-demo-only-password'
SEED_DEMO_PASSWORD="$SEED_DEMO_PASSWORD" npm run seed --workspace @inpacare/api
unset SEED_DEMO_PASSWORD
```

Jalankan API di terminal pertama.

```sh
npm run dev:api
```

API menerima permintaan di **http://127.0.0.1:8080**. Jalankan migrasi dan pengisian data secara terpisah. Endpoint `/health` memeriksa koneksi basis data. Isi `TRUSTED_ORIGINS` dengan origin peramban yang dipakai untuk permintaan yang mengubah data, termasuk masuk.

Jalankan aplikasi web di terminal kedua.

```sh
npm run dev
```

Buka alamat yang ditampilkan Vite, biasanya **http://127.0.0.1:5173**. Proksi web memakai API lokal di port 8080 secara bawaan. Isi `API_ORIGIN` jika API berjalan di alamat lain.

## Variabel lingkungan

| Variabel | Pemakai | Kegunaan |
| --- | --- | --- |
| `DATABASE_URL` | API dan CLI migrasi | URL koneksi PostgreSQL. Wajib diisi. |
| `API_BIND` | API | Alamat layanan, bawaan `127.0.0.1:8080`. |
| `TRUSTED_ORIGINS` | API | Origin HTTP(S) yang diizinkan mengubah data. Pisahkan dengan koma. |
| `SEED_DEMO_PASSWORD` | CLI pengisian data | Kata sandi akun demo. Tabel pengguna harus kosong. |
| `API_ORIGIN` | Server web | Alamat API, bawaan `http://127.0.0.1:8080`. |
| `HOST`, `PORT` | Server web produksi | Alamat dan port. Vite menampilkan alamat pengembangan sendiri. |
| `HTTPS_PROXY_PORT` | Server web Linux | Port loopback opsional untuk terowongan HTTPS tepercaya. |
| `INPACARE_TEST_URL` | Pengujian | URL dasar API untuk Python atau origin aplikasi web untuk Playwright. |

Lihat [akun demo](../../README.md#akun-demo). API memeriksa peran dan penugasan pada data yang diminta.

## Pemeriksaan dan kode hasil generasi

```sh
npm run check
npm run build
npm run types:api
npm run test:api:unit
```

Kontrak API tersedia di `contracts/openapi.json`. Jalankan `npm run types:api` setelah mengubahnya. Migrasi SQL dan CLI basis data tersedia di `apps/api/src/infrastructure/database/`.

Uji perilaku API dengan [alur API](API_TESTS.md) pada basis data sementara yang baru. Untuk perubahan antarmuka, jalankan [alur peramban](BROWSER_TESTS.md). Isi `INPACARE_TEST_URL=http://127.0.0.1:5173` jika menggunakan Vite.

## Pengoperasian lokal seperti produksi

Perintah `npm run build` menyimpan hasil API di `apps/api/dist` dan aplikasi web di `apps/web/build`. Layanan Linux menjalankan hasil build Node.js tersebut. Ikuti [panduan Linux](../deployment/NATIVE_HOSTING.md) atau [panduan Docker Compose](../deployment/HOSTING.md).
