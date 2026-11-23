# Penjelajah API InpaCare

Masuk di `/login`, lalu buka `/api-docs` pada alamat InpaCare yang sama. Tautan di bagian atas halaman membawa Anda kembali ke InpaCare atau ke pgAdmin di `/db/`.

Swagger UI menampilkan `contracts/openapi.json`. Halaman dan `/api-docs/openapi.json` hanya tersedia dengan sesi InpaCare yang aktif. Respons bersifat privat dan tidak disimpan dalam cache. Aset Swagger UI dibundel dari dependensi npm lokal.

Buka operasi yang ingin diuji, pilih **Try it out**, isi parameternya, lalu pilih **Execute**. Permintaan memakai kuki sesi Anda. Untuk perubahan data, penjelajah menyertakan nilai kuki `csrf_token` sebagai header `X-CSRF-TOKEN`. API memeriksa peran, cakupan pasien, versi, dan isian. Penjelajah hanya mengirim permintaan ke origin aplikasi. Jika sesi berakhir, masuk kembali sebelum menjalankan operasi.

Perubahan dari penjelajah langsung berlaku pada basis data aplikasi. Gunakan instans lokal dengan data sintetis untuk percobaan. Akun Admisi dapat mendaftarkan pasien melalui halaman **Data pasien** atau `POST /api/v1/patients`.

Akun pgAdmin terpisah dari akun InpaCare. Lihat cara menyiapkan akun basis data dan memberi izin baca atau edit di [panduan pgAdmin](../deployment/SHARED_TOOLS.md).

## Pemeriksaan lokal

```sh
npm run test --workspace @inpacare/web -- src/routes/api-docs
npm run check:web:architecture
npm run check --workspace @inpacare/web
npm run build --workspace @inpacare/web
```
