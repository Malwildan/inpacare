# Kontrak API

`openapi.json` menjelaskan API NestJS dan menjadi sumber deklarasi TypeScript untuk aplikasi web. Controller, DTO, layanan transaksional, dan batasan PostgreSQL menerapkan validasi. API memilih kolom respons sesuai operasi dan akses akun.

Jalankan `npm run types:api` setelah menyunting spesifikasi. Perintah ini menulis `apps/web/src/lib/generated/api.d.ts`. Jalankan `npm run test:api:contract` untuk memeriksa rute, DTO, status, dan penjaga akses. Gunakan `npm run test:api:http-contract` dengan `INPACARE_TEST_URL` yang mengarah ke instans sementara untuk memeriksa respons JSON langsung.

Autentikasi memakai kuki `session` dengan token opak dan kuki `csrf_token` yang dapat dibaca. Permintaan yang mengubah data membutuhkan `Origin` yang cocok. Jika memerlukan autentikasi, sertakan `X-CSRF-Token`. Saat membuat sesi, respons mencakup `user.csrfToken`. ID berupa teks opak, tanggal memakai format ISO, waktu memakai RFC 3339, dan nominal dikirim sebagai teks desimal.

`POST /cycles` menerima salah satu dari `placementId` dan `newPlacement: { roomId, startsOn, endsOn }`. Penempatan yang berhasil menghasilkan rekap `assigned`. Jika keduanya tidak disertakan, rekap berstatus `pending`. Mulai perawatan melalui perubahan terpisah ke `in_care` dengan versi saat ini. Gunakan status yang dikembalikan API.

Kirim UUID yang dibuat klien sebagai `requestId`. Pertahankan ID saat mengirim ulang isian yang sama. Untuk perawat, ID, dan isian yang sama, API mengembalikan hasil awal. Baca endpoint detail untuk melihat kondisi terkini. Mengirim isian berbeda dengan ID yang sama menghasilkan 409. Transaksi yang gagal tidak meninggalkan hasil. Klien lama dapat menghilangkan kolom ini dan tetap menerima konflik jika pasien sudah memiliki rekap aktif. Jalankan migrasi `CycleCreationRequests1793577600005` sebelum memakai API dan formulir terkait.

`error.code` dan status HTTP dipakai untuk percabangan klien. `error.message` berisi petunjuk bagi pembaca. Saat menyunting pesan API, jalankan `node scripts/generate-public-errors.mjs` untuk memperbarui daftar pesan yang dapat ditampilkan di aplikasi web.
