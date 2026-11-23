# Pengoperasian di Linux dengan systemd

Jalankan aplikasi web, NestJS, dan PostgreSQL sebagai layanan pengguna pada **Linux x86_64 dengan systemd**. Pemasang mendukung distribusi yang kompatibel dengan Ubuntu 24.04, termasuk Linux Mint 22. Untuk host lain, sesuaikan runtime atau gunakan [paket Docker](HOSTING.md).

## Siapkan aplikasi

Rilis memerlukan Node.js 24.18+ serta hasil build API dan web. Skrip menyiapkan Node.js dan PostgreSQL di direktori proyek. Jalankan perintah dari akar repositori.

```sh
bash scripts/setup-native-linux.sh
.runtime/node/bin/npm ci --no-audit --no-fund
.runtime/node/bin/npm run build:api
.runtime/node/bin/npm run build
bash scripts/native-host.sh prepare
bash scripts/native-host.sh migrate
```

Untuk basis data baru dan kosong, jalankan `migrate` sebelum memulai aplikasi. Perintah dapat diulang karena versi yang sudah diterapkan tercatat. Untuk basis data dari API Rust, buat cadangan, hentikan penulisan dari API dan web, lalu jalankan `bash scripts/native-host.sh adopt`. Perintah tersebut memeriksa sidik skema sebelum menandai versi dasar dan menambahkan perubahan skema. Mulai ulang aplikasi lama setelah adopsi berhasil. Pembaruan otomatis memeriksa adopsi basis data sebelum menghentikan layanan. Lihat [pembaruan otomatis](CONTINUOUS_DELIVERY.md#existing-rust-database-adoption).

Untuk membuat akun demo sintetis, gunakan basis data kosong dan tetapkan kata sandi khusus demo.

```sh
SEED_DEMO_PASSWORD='choose-a-demo-only-password' bash scripts/native-host.sh seed-demo
```

Permintaan yang mengubah data, termasuk masuk, memerlukan Origin yang cocok dengan skema, host, dan port dari luar, atau entri yang sama persis di `TRUSTED_ORIGINS` dalam `.data/native.env`. Aplikasi web dan terowongan ber-origin sama dapat memakai daftar bawaan. Isi `TRUSTED_ORIGINS` untuk aplikasi web yang dioperasikan terpisah. Letakkan API di belakang proksi web yang mengganti header host dan protokol terusan. API hanya memercayai header itu dari `TRUST_PROXY`, dengan bawaan loopback. Pasang layanan setelah penyiapan.

```sh
bash scripts/native-host.sh install
```

Runtime lokal berada di `.runtime`. Kredensial privat dan data PostgreSQL berada di `.data`. Pemasang bekerja tanpa sudo atau paket global dan mempertahankan data serta kredensial yang ada. API menerima permintaan di `127.0.0.1:8080`, PostgreSQL di `127.0.0.1:55432`, dan web di `0.0.0.0:8088`. Buka **http://127.0.0.1:8088** dari host. Gunakan direktori data yang sesuai dengan PostgreSQL 16.
## Kelola layanan dan data

```sh
bash scripts/native-host.sh status
bash scripts/native-host.sh stop
bash scripts/native-host.sh start
journalctl --user -u inpacare-api -u inpacare-web -n 50 --no-pager
```

Menghentikan atau memulai layanan tidak menghapus data. Layanan pengguna dapat mulai saat boot tanpa login interaktif jika pengelola pengguna mengaktifkan lingering. Periksa akun dengan `loginctl show-user "$USER" -p Linger`. Kelola lingering di luar pemasang aplikasi.

Simpan `.data/postgres`, `.data/native.env`, dan `.data/admin-password` sebelum memindahkan atau memperbarui host. Direktori `.data` hanya dapat diakses pemilik dan berkas kredensial memakai mode 0600. Cadangkan dengan `pg_dump` bawaan serta konfigurasi privat yang ada. Uji pemulihan secara terpisah. Pertahankan direktori data dan kredensial saat menelusuri kegagalan startup.

## Alamat HTTPS publik opsional

Port 8088 memakai HTTP sebagai protokol eksternal. `HTTPS_PROXY_PORT=8089` membuka port loopback yang memakai HTTPS sebagai protokol eksternal. Keduanya menimpa header protokol klien. Arahkan terowongan ke `http://127.0.0.1:8089` dan pertahankan nama host publik agar kuki sesi memakai atribut `Secure`.

Untuk memakai akun ngrok sendiri, buat `.data/ngrok.yml` di editor lokal. Ganti nilai contoh dengan authtoken akun Anda dan simpan berkas di luar Git.

```yaml
version: '3'
agent:
  authtoken: YOUR_NGROK_AUTHTOKEN
  web_addr: 127.0.0.1:4049
  console_ui: false
  log: stdout
  log_format: json
  update_check: false
```

Pasang dan periksa layanan dengan perintah berikut.

```sh
chmod 600 .data/ngrok.yml
bash scripts/public-tunnel.sh install
bash scripts/public-tunnel.sh url
bash scripts/public-tunnel.sh status
```

Jika diperlukan, pemasang mengambil ngrok dari repositori APT resmi yang ditandatangani. Pemasang mengaktifkan `inpacare-ngrok` dan meneruskan koneksi ke port loopback untuk origin HTTPS. API agen tetap di `127.0.0.1:4049` dengan inspeksi permintaan dinonaktifkan. Konfigurasi proyek memakai berkas privat terpisah dari konfigurasi akun.

Jalankan `bash scripts/public-tunnel.sh stop` untuk menghentikan akses publik atau `start` untuk memulihkannya. Domain akun ngrok tetap sama setelah agen dimulai ulang. Paket gratis memiliki kuota dan halaman perantara untuk kunjungan pertama. Pastikan host tetap aktif dan terhubung. Gunakan akun dan instans sendiri untuk pengembangan. [Batas ngrok](https://ngrok.com/docs/pricing-limits/free-plan-limits) · [Alamat demo](../../README.md)

## Pengujian

Jalankan `python3 scripts/test-native-host.py` untuk menguji API pada basis data sementara yang terpisah. Periksa akses HTTPS publik, akses LAN, ketahanan data, dan perilaku setelah reboot secara terpisah. Hasil sebelumnya tercatat di [status proyek](../PROJECT_STATUS.md).
