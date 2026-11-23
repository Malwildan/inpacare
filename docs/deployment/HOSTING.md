# Pengoperasian Docker di Mac atau Linux

Host demo memakai [layanan Linux](NATIVE_HOSTING.md). Panduan ini menjelaskan paket Docker sebagai pilihan pengoperasian.

Gunakan Docker Desktop di Mac atau Docker Engine di Linux. Paket mendukung build multiarsitektur, termasuk Apple Silicon. PostgreSQL, API NestJS, server SvelteKit, dan Caddy berjalan pada satu origin LAN privat atau tailnet. Siapkan akses jaringan di luar paket aplikasi.

## Jalankan demo

Aktifkan Docker dengan Compose v2 dan sediakan OpenSSL. Jalankan perintah dari akar proyek.

```sh
sh ./scripts/host.sh migrate
# Optional synthetic demo fixtures, only on an empty database:
SEED_DEMO_PASSWORD='choose-a-demo-only-password' sh ./scripts/host.sh seed-demo
# Add exact LAN/tailnet browser origins to TRUSTED_ORIGINS in .env.local, then:
sh ./scripts/host.sh start
```

Perintah migrasi membuat kata sandi acak di `.env.local` dengan izin khusus pemilik, memulai PostgreSQL, dan menerapkan migrasi NestJS. Migrasi dan pengisian data dijalankan terpisah dari startup. Pengisian demo memerlukan `SEED_DEMO_PASSWORD` dan tabel pengguna kosong. `start` memeriksa Compose, membangun image NestJS dan Node.js sesuai arsitektur, lalu menunggu PostgreSQL, API, dan web siap. Layanan memakai kebijakan `unless-stopped`. Buka `http://127.0.0.1:8088` dari host.

Untuk basis data API Rust yang sudah ada, buat cadangan dan gunakan `sh ./scripts/host.sh adopt`. Perintah menghentikan penulisan API dan web, memeriksa sidik skema, menerapkan perubahan tambahan, dan memulai kembali layanan sebelumnya. Jika skema berbeda, adopsi berhenti sebelum aplikasi berganti.

Caddy membuka port 8088 pada semua antarmuka IPv4. Dari LAN privat, buka `http://<host-LAN-IP>:8088`. Dari tailnet privat, buka `http://<host-Tailscale-IP>:8088`. Pertahankan akses demo di jaringan privat.

## Jaringan layanan dan penyimpanan

Caddy menerbitkan port untuk host. Layanan lain berkomunikasi melalui jaringan Docker privat. SvelteKit mengambil host dan protokol dari header terusan Caddy, lalu meneruskan permintaan ke `http://api:8080` dengan pemeriksaan Origin dan CSRF tetap berlaku. Caddy adalah satu-satunya kontainer pada jaringan yang menghadap web. Jalankan `sh ./scripts/host.sh migrate` sebelum startup. Isi demo pada basis data kosong jika diperlukan. API menunggu PostgreSQL siap dan server web menunggu API siap. [Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/) · [adapter-node](https://svelte.dev/docs/kit/adapter-node) · [Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

PostgreSQL menyimpan data di volume `inpacare_postgres_data`. `docker compose stop`, `start`, dan `up -d` mempertahankan volume. `scripts/host.sh` mempertahankan volume yang sudah ada. `docker compose down -v` menghapus basis data demo.

## Cadangkan dan pulihkan data

Jalankan perintah dari akar proyek agar Compose memakai `.env.local` dan nama proyek yang sama. Buat cadangan privat sebelum memulihkan data.

```sh
mkdir -p backups
umask 077
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml exec -T db pg_dump -U inpacare -d inpacare -Fc > "backups/inpacare-$(date +%Y%m%d-%H%M%S).dump"
```

Hentikan penulisan API dan web sebelum memulihkan arsip, lalu mulai kembali setelah pemulihan selesai. Opsi `--clean` mengganti objek basis data yang cocok. Siapkan cadangan baru sebelum menjalankannya.

```sh
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml stop web api
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml exec -T db pg_restore --clean --if-exists --no-owner -U inpacare -d inpacare < backups/your-backup.dump
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml start api web
```

Simpan `.env.local` dan cadangan secara privat. Tambahkan origin peramban yang tepat di `TRUSTED_ORIGINS` dalam `.env.local`. Permintaan yang mengubah data, termasuk masuk, memerlukan origin yang diizinkan. Pengisian demo memerlukan `SEED_DEMO_PASSWORD` dan tabel pengguna kosong. Gunakan data dan identitas sintetis khusus demo.

## Hentikan dan periksa layanan

```sh
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml ps
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml logs --tail=100
docker compose --project-name inpacare --project-directory "$PWD" --env-file .env.local --file ops/compose.yaml stop
```

Volume basis data tetap tersedia setelah layanan dihentikan. Jalankan `sh ./scripts/host.sh` untuk membangun dan memulai ulang layanan selepas perubahan kode. Compose membaca substitusi dari berkas lingkungan lokal yang diabaikan Git. [Referensi interpolasi Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
