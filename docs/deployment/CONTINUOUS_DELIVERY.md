# CI dan pembaruan demo otomatis di Linux

Setiap pull request menjalankan pemeriksaan web, kontrak, dan API yang sesuai. Push ke `main`, pemicu manual, dan jadwal harian menjalankan seluruh pemeriksaan. Gerbang API mencakup ESLint, TypeScript, uji unit, kontrak, dan integrasi PostgreSQL. Audit dependensi menahan paket rilis jika ada temuan tinggi atau kritis.

Setelah semua pemeriksaan lulus, CI mengemas API dan web hasil build. CI memasang dependensi produksi, menjalankan migrasi dan pengisian data di PostgreSQL sementara, memeriksa kedua port web, lalu menjalankan alur API pada paket tersebut. Perubahan CI atau skripnya juga menguji pengemasan dalam pull request.

Push atau pemicu manual yang berhasil di `main` menerbitkan `native-<full commit SHA>` dengan `inpacare-linux-x86_64.tar.gz` dan `SHA256SUMS`. Jadwal dan pull request hanya menguji. Izin `contents: write` diberikan pada pekerjaan publikasi. Rilis draf menahan unggahan yang belum lengkap dan commit lama tidak menggantikan rilis terbaru.

## Aktifkan pembaruan pada host yang sudah berjalan

Host mengambil rilis publik melalui HTTPS. Akses ini tidak memerlukan token GitHub, SSH masuk, atau runner Actions pada host. [Dokumentasi rilis publik GitHub](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)

Siapkan layanan menurut [panduan Linux](NATIVE_HOSTING.md), Python **3.12+**, dan pengelola pengguna systemd yang aktif. Dari salinan versi ini, jalankan sebagai pengguna pemilik demo.

```sh
bash scripts/install-native-cd.sh /absolute/path/to/existing/inpacare
```

Pemasang menyalin pembaru ke `.deploy/`, menambahkan konfigurasi layanan API dan web yang menunjuk ke `.deploy/current`, lalu mengaktifkan `inpacare-update.timer`. Aplikasi lama berjalan hingga rilis pertama diaktifkan. PostgreSQL, terowongan, konfigurasi lingkungan, dan kredensial disimpan di instalasi awal.

Timer memeriksa dua menit setelah boot dan lima menit setelah pemeriksaan sebelumnya selesai. Host yang sempat luring memeriksa setelah kembali tersambung. Timer memerlukan pengelola pengguna yang aktif. Lihat petunjuk lingering pada panduan Linux.

```sh
systemctl --user list-timers inpacare-update.timer --no-pager
journalctl --user -u inpacare-update.service -n 50 --no-pager
python3 /absolute/path/to/inpacare/.deploy/deploy-native.py \
  --root /absolute/path/to/inpacare --check
systemctl --user start inpacare-update.service
```

Opsi `--check` memeriksa rilis yang tersedia tanpa menerapkannya. Jalankan pemasang kembali untuk memperbarui salinan pembaru. Setelah diaktifkan, timer menangani pembaruan berkas aplikasi.

Mengganti nama cabang tidak memperbarui pemasang lama. Saat beralih dari Rust, jalankan pemasang dari rilis NestJS terverifikasi yang memuat `scripts/install-native-cd.sh`, `scripts/deploy-native.py`, dan unit timer. Selesaikan adopsi basis data sebelum mengaktifkan rilis. Gunakan pembaru NestJS untuk arsip NestJS.

Setelah aktivasi, buka `https://YOUR_DOMAIN/__version`. Cocokkan `revision` dengan SHA lengkap commit `main` dan pastikan `backend` bernilai `nestjs`. Endpoint ini menampilkan versi web tanpa cache. Pastikan layanan API menjalankan `node apps/api/dist/main.js` dari rilis yang sama dan `/health` berhasil secara lokal.

<a id="existing-rust-database-adoption"></a>

## Adopsi basis data Rust yang sudah ada

Untuk basis data Rust yang berisi data, pembaru menyiapkan rilis dan memeriksa penanda versi dasar NestJS sebelum menghentikan layanan. Jika penanda belum ada, pembaru berhenti dan menampilkan lokasi rilis di `.deploy/releases/`. Matikan timer, buat cadangan terbaru, lalu lakukan adopsi dengan pemeriksaan sidik skema pada waktu pemeliharaan.

```sh
ROOT=/absolute/path/to/inpacare
RELEASE="$ROOT/.deploy/releases/FULL_COMMIT_SHA"
systemctl --user disable --now inpacare-update.timer
mkdir -p "$ROOT/.data/backups"
chmod 700 "$ROOT/.data/backups"
set -a
. "$ROOT/.data/native.env"
set +a
"$ROOT/.runtime/postgres/usr/lib/postgresql/16/bin/pg_dump" --format=custom \
  --file="$ROOT/.data/backups/pre-adoption.dump" "$DATABASE_URL"
systemctl --user stop inpacare-web inpacare-api
export PATH="$ROOT/.runtime/node/bin:$PATH"
cd "$RELEASE"
npm run migration:adopt --workspace @inpacare/api
systemctl --user start inpacare-api inpacare-web
systemctl --user enable --now inpacare-update.timer
```

Jika sidik skema tidak cocok, pertahankan penunjuk rilis dan mulai kembali aplikasi lama. Perbaiki perbedaan skema secara terpisah. Setelah adopsi berhasil, pembaru berikutnya menerapkan migrasi yang tertunda sebelum memulai API kandidat.

## Aktivasi, cadangan, dan pemulihan

Pembaru menerima rilis Linux terbaru yang cocok dengan commit `main`. Pembaru memeriksa checksum, penanda commit, berkas wajib, dan jalur arsip sebelum memasang dependensi produksi di direktori rilis baru. Kunci berkas mencegah pembaruan bersamaan. Aplikasi tetap tersedia selama penyiapan.

Sebelum aktivasi, pembaru membuat cadangan dengan akses pemilik di `.data/backups/pre-update-*.dump`, menghentikan penulisan API dan web, lalu menjalankan migrasi. Jika pemasangan dependensi gagal, rilis lama tetap berjalan. Jika migrasi gagal, pembaru memulai kembali rilis lama. Setelah migrasi berhasil, penunjuk rilis diganti dalam satu langkah. Pembaru memulai API dan web, lalu memeriksa API dan port web untuk origin HTTP serta HTTPS. Basis data dan terowongan tetap berjalan selama API dan web dimulai ulang.

Jika aktivasi gagal, pembaru mengembalikan penunjuk aplikasi dan memulai layanan sebelumnya. **Migrasi yang selesai tetap berlaku.** Buat migrasi yang menambah skema dan kompatibel dengan rilis lama. Pemulihan cadangan adalah tindakan terpisah yang dapat menghilangkan penulisan setelah cadangan dibuat. Periksa kesehatan layanan dan log setelah kegagalan.

Jeda pembaruan otomatis sebelum pemulihan manual.

```sh
systemctl --user disable --now inpacare-update.timer
```

Tunggu pekerjaan `inpacare-update.service` selesai. Pilih rilis yang diketahui berfungsi dari `.deploy/releases/` atau direktori instalasi awal. Alihkan rilis saat API dan web berhenti.

```sh
cd /absolute/path/to/inpacare
systemctl --user stop inpacare-web inpacare-api
ln -s "$PWD/.deploy/releases/FULL_COMMIT_SHA" .deploy/current-recovery
mv -Tf .deploy/current-recovery .deploy/current
systemctl --user start inpacare-api inpacare-web
```

Rilis dan cadangan disimpan untuk pemeriksaan dan pemulihan. Periksa pemakaian disk secara berkala. Simpan rilis aktif, `.data`, `.runtime`, dan cadangan yang masih diperlukan. Aktifkan kembali timer dengan `systemctl --user enable --now inpacare-update.timer`.
