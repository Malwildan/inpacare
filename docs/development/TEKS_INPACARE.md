# Inventaris teks InpaCare

| Layar dan pengguna | Teks yang diperiksa | Bagian yang sudah sesuai |
| --- | --- | --- |
| Masuk · semua petugas | Label kredensial, isian wajib, percobaan masuk, sesi, proses dan hasil | Tombol tampilkan atau sembunyikan kata sandi sudah memiliki label |
| Navigasi dan halaman kesalahan · semua petugas | Nama modul, menu akun, akses terbatas, halaman hilang, kegagalan layanan dan tautan kembali | Menu sudah mengikuti peran |
| Notifikasi · semua petugas | Judul, status baca, keadaan kosong, gagal muat, muat ulang dan tandai dibaca | Isi pemberitahuan lama tampil dari riwayat |
| Data dan ringkasan pasien · Admisi, serta ringkasan sesuai akses | Pencarian, isian identitas, bantuan BPJS, nomor rekam medis, daftar kosong dan hasil pendaftaran | Daftar sudah membedakan pencarian tanpa hasil dari daftar kosong |
| Rekap rawat inap · Perawat dan Dokter | Buat rekap, penempatan, hasil bertahap, permintaan perpanjangan atau pelepasan, keputusan, hapus, riwayat dan konflik | Rekap tanpa ruang tetap berstatus Menunggu |
| Ruang rawat inap · petugas, dengan pengelolaan oleh Koordinator | Status ruang, kapasitas, tarif per hari, fasilitas, arsip, dan isian | Nilai tarif dan biaya tetap mengikuti aturan yang berlaku |
| Kalender dan riwayat penempatan · petugas sesuai akses | Tanggal masuk dan selesai, ketersediaan ruang, kapasitas, ubah, batalkan dan riwayat | Kalender sudah menyediakan filter ruang dan pekan |
| Papan dan detail tugas perawatan · Perawat dan Koordinator | Status, penanggung jawab, batas tindakan, gagal muat, filter, pembatalan, penghapusan dan riwayat | Papan sudah membedakan kolom kosong, tersaring dan gagal dimuat |
| Daftar dan detail rekam medis · Dokter dan Perawat sesuai akses | Judul, observasi, tanda vital, koreksi, hapus, status dan riwayat | Satuan tanda vital sudah terlihat pada formulir |
| Tagihan dan klaim · Admisi | Rincian layanan, nominal, pembayaran, verifikasi BPJS, riwayat dan hapus | Total dan jaminan tetap dihitung sesuai aturan yang berlaku |
| Penjelajah API · petugas yang telah masuk | Petunjuk penggunaan, deskripsi OpenAPI dan contoh kesalahan | Nama operasi, parameter, contoh kontrak dan antarmuka bawaan Swagger UI tetap mengikuti sumbernya |
| Komponen bersama · semua petugas | Tombol ikon, pembaca layar, pemilih tanggal, pemuatan dan pemberitahuan | Penanda fokus dan struktur dialog sudah tersedia |
| Panduan aktif · pengembang dan operator | Pengenalan, penyiapan, pengujian, kontribusi, pengoperasian, referensi dan kontrak | Perintah, variabel lingkungan dan nilai kontrak dapat disalin dari contoh |

Sumber pesan meliputi validasi formulir, DTO, aturan domain dan kasus penggunaan, filter pengecualian API, transport web, kegagalan pemuatan halaman, serta status dan dialog pada komponen. Pemeriksaan RASA berjalan dari ritme kalimat, kecocokan dengan perilaku aplikasi, manfaat petunjuk, hingga pembacaan dari sudut pandang petugas. Rujukan ejaan mengikuti [EYD V](https://ejaan.kemendikdasmen.go.id/).

## Pemeliharaan pesan

- Mulai dari label yang terlihat. Gunakan label yang sama dalam pesan validasi dan sebutkan batas atau contoh yang berlaku.
- Bedakan penolakan sebelum simpan, perubahan versi, benturan jadwal atau kapasitas, hasil simpan yang belum diketahui, dan kegagalan membaca data setelah perubahan tersimpan.
- Setelah mengubah pesan kesalahan API, jalankan `node scripts/generate-public-errors.mjs`. Pemeriksaan `npm run test:web` memastikan daftar teks web sesuai sumbernya.
- Nominal ditampilkan dengan lambang Rp yang melekat pada angka, titik untuk ribuan, dan koma untuk pecahan. Tanggal tampilan Indonesia tetap terpisah dari tanggal ISO yang dikirim ke API. [EYD V tentang angka dan bilangan](https://ejaan.kemendikdasmen.go.id/eyd/penulisan-kata/angka-dan-bilangan/)
