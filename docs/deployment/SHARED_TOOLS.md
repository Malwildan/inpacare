# Perangkat PostgreSQL bersama

InpaCare menyediakan pgAdmin di <https://inpacare.hailmary.my.id/db/>. Gunicorn menjalankannya sebagai satu proses layanan pengguna di `127.0.0.1:5050` di belakang Caddy HTTPS. PostgreSQL tetap pada port lokalnya. Caddy menambahkan gateway `/db` dengan DNS, firewall, dan rute aplikasi yang sama.

## Pasang dan periksa layanan

Jalankan perintah dari akar proyek.

```sh
scripts/setup-pgadmin.sh
python3 scripts/pgadmin.py status
```

pgAdmin 4 `9.19` berada di `.data/pgadmin/venv` dengan Gunicorn `23.0.0`. Jika paket wheel tidak memuat berkas antarmuka yang diperlukan, pemasang membangun sumber resmi 9.19 dengan input yang diperiksa checksum. Penyiapan ulang pertama memerlukan Node.js dan jaringan. Paket lengkap yang sudah ada dipakai kembali.

Pengaturan SQLite, sesi, penyimpanan, log, dan kredensial ada di `.data/pgadmin/` di luar direktori rilis. Kredensial pemilik pgAdmin disimpan di `.data/pgadmin/owner-credentials.txt`. Kata sandi penyunting basis data pemilik ada di `.data/pgadmin/owner-db-password.txt`. Kedua berkas hanya dapat dibaca pemilik.

Setiap pengguna pgAdmin memiliki definisi server pribadi dan login PostgreSQL sendiri. Pemasang mendaftarkan koneksi untuk pemilik, dan perintah penambahan anggota mendaftarkan koneksi untuk akun baru. pgAdmin meminta kata sandi basis data saat koneksi dibuka.

## Tambahkan anggota

```sh
python3 scripts/pgadmin.py add-user teammate@example.com viewer
python3 scripts/pgadmin.py add-user colleague@example.com editor
```

Perintah membuat pgAdmin `User` dan login basis data individual. Keluaran hanya memuat lokasi berkas kredensial privat. Bagikan kredensial melalui saluran terpisah. Simpan isinya di luar Git, log, dan percakapan. Untuk mengganti akses, nonaktifkan login pgAdmin dan PostgreSQL lama sebelum membuat akun dengan izin baru.

Pembaca dan penyunting mengakses tabel publik yang telah ditinjau, yaitu `cycle_requests`, `cycles`, `doctors`, `invoice_lines`, `invoices`, `medical_records`, `notifications`, `nurses`, `observations`, `patients`, `placements`, `room_items`, `rooms`, `tasks`, dan `vital_signs`. Pembaca mendapat `SELECT`. Penyunting mendapat `SELECT`, `INSERT`, `UPDATE`, `DELETE`, dan penggunaan sequence. Kedua peran tidak dapat membaca tabel autentikasi, sesi, migrasi, atau riwayat, membuat objek tetap atau sementara, melakukan `TRUNCATE`, atau mengelola klaster.

Izin bawaan `PUBLIC` untuk objek sementara dicabut pada basis data ini. Login aplikasi mempertahankan izin sementaranya. Tabel baru masuk daftar izin setelah ditinjau dan ditambahkan oleh sinkronisasi izin. Migrasi tetap dijalankan oleh aplikasi.

## Layanan dan gateway

```sh
systemctl --user status inpacare-pgadmin.service
systemctl --user restart inpacare-pgadmin.service
```

Cadangan konfigurasi Caddy berada di `.data/pgadmin/backups/inpacare.caddy.before-pgadmin`. Unit pengguna terpasang di `~/.config/systemd/user/inpacare-pgadmin.service` dan templat repositori di `ops/native/inpacare-pgadmin.service`.

Proksi `/db` hanya memercayai rentang proksi yang diterbitkan Cloudflare agar sesi pgAdmin memperoleh alamat pengunjung yang konsisten. Perlindungan kuki, autentikasi, dan CSRF aktif. Perbarui `CLOUDFLARE_PROXY_CIDRS` dan templat situs jika rentang berubah. Batasi kepercayaan itu pada rute pgAdmin.

## Pengujian

Jalankan `python3 scripts/check-pgadmin.py` untuk memeriksa batas izin pembaca dan penyunting. Pengujian mencakup penolakan tabel autentikasi, sesi, riwayat, migrasi, DDL tetap dan sementara, serta `TRUNCATE`. Skrip memasukkan dan menghapus satu baris sintetis `room_items` untuk menguji izin tulis.

Pemeriksaan HTTP mengambil skrip dan stylesheet yang dirujuk, lalu memeriksa respons 200 tidak kosong dan tipe MIME. Uji juga masuk, sesi, awalan rute, serta atribut Secure, HttpOnly, dan SameSite melalui gateway lokal dan HTTPS publik. Hasil tersanitasi disimpan di `.data/pgadmin/performance-verification.json`. Skrip membuat dua akun sementara beserta login SQL, lalu menghapusnya dalam `finally`. Pemeriksaan gagal jika ada pembatasan yang belum dapat dipastikan.

## Rujukan pengoperasian

- [Paket Python pgAdmin 4 9.19](https://www.pgadmin.org/download/pgadmin-4-python/)
- [Pemasangan server pgAdmin 4 9.19](https://www.pgadmin.org/docs/pgadmin4/9.19/server_deployment.html)
- [Pengelolaan pengguna pgAdmin 4 9.19](https://www.pgadmin.org/docs/pgadmin4/9.19/user_management.html)
