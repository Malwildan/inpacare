# Kontrak tugas perawatan dan rekam medis

Awalan API adalah `/api/v1`. Semua rute memerlukan sesi aktif. JSON menggunakan camelCase. ID pasien dan petugas berupa teks opak. Daftar memakai batas bawaan 50 dan batas maksimum 100. Sumber tugas dan rekam medis tercatat dalam [bukti kebutuhan](../planning/sources/requirements-evidence.md).

## Tugas perawatan

### `GET /tasks`

Parameter opsional meliputi `search`, `status` (`todo | in_progress | done | cancelled`), `priority` (`low | normal | high`), `roomId`, `patientId`, `picId`, `from`, `to`, `limit`, `offset`, dan `order=board`. Urutan papan tersimpan untuk tiap status. Jika `order` tidak dikirim, API mengurutkan menurut jadwal lalu ID. Status `todo` tampil sebagai **Belum dikerjakan**. Koordinator melihat tugas di bangsal, sedangkan perawat melihat tugas yang ditetapkan untuk akunnya. Pencarian mencakup judul tugas, nama pasien, dan nomor rekam medis.

```json
{"items":[{"id":"…","title":"Pemeriksaan tanda vital","description":"…","notes":"…","patientId":"…","patientName":"…","medicalRecordNo":"RM-…","roomId":"…","roomName":"Melati 02","picId":"…","picName":"Dina Putri","priority":"high","status":"todo","startsAt":"2026-10-29T03:00:00Z","endsAt":"2026-10-29T03:30:00Z","version":1}],"total":1}
```

`total` menghitung semua hasil sesuai akses dan filter. `counts` menghitung hasil per status. Gunakan `limit` (bawaan 50, maksimal 100) dan `offset` untuk memuat halaman berikutnya.

### `POST /tasks`

Hanya koordinator. Kirim `{ patientId, placementId, picId, title, description?, notes?, priority, startsAt, endsAt }`. Gunakan RFC 3339 dengan zona waktu. `endsAt` harus sama dengan atau setelah `startsAt`. Pilih `low`, `normal`, atau `high`. Penempatan harus aktif, milik pasien tersebut, dan mencakup kedua tanggal setempat. Pilih perawat aktif sebagai penanggung jawab. Server mengambil `roomId` dari penempatan dan menyimpan tugas `todo` versi 1 bersama riwayatnya dalam satu transaksi. Respons berisi tugas baru.

### `GET /tasks/{id}`

Koordinator atau penanggung jawab saat ini menerima detail tugas. Setelah pengalihan, penanggung jawab sebelumnya menerima 404.

### `PATCH /tasks/{id}`

Koordinator atau penanggung jawab saat ini mengirim `{ expectedVersion, status?, notes?, reason? }`. Sertakan kolom perubahan. API mengunci data, memeriksa versi, serta menyimpan tugas dan riwayat dalam satu transaksi. Penanggung jawab dapat mengubah `todo -> in_progress -> done`. Koordinator juga dapat membatalkan `todo` atau `in_progress` dengan `reason` yang tidak kosong. Tugas selesai atau dibatalkan tidak dapat dibuka kembali. Versi lama menghasilkan 409. Perubahan status yang ditolak atau alasan yang kosong menghasilkan 422. Respons berisi tugas terbaru.

### `POST /tasks/{id}/move`

Koordinator atau penanggung jawab saat ini mengirim `{ expectedVersion, status, beforeTaskId, reason? }`. Gunakan `null` pada `beforeTaskId` untuk menaruh tugas di akhir daftar tujuan. Tugas acuan harus terlihat bagi petugas dan berstatus sama dengan tujuan. Aturan perubahan status dan pembatalan tetap berlaku. API mendukung pengurutan dalam status yang sama, termasuk pada daftar selesai dan dibatalkan. Perpindahan menambah versi dan riwayat. Mengirim posisi yang sama tidak menambahnya. Perubahan status lewat PATCH lama menaruh tugas di akhir daftar tujuan. Terapkan migrasi `TaskBoardPosition1793577600003` sebelum versi API ini.

### `POST /tasks/{id}/reassign`

Hanya koordinator. Kirim `{ expectedVersion, picId, reason }`. Pilih perawat aktif dan isi alasan. Tugas selesai, dibatalkan, atau dihapus tidak dapat dialihkan. Perubahan dan riwayat disimpan dalam satu transaksi. Penanggung jawab lama kehilangan akses ke detail dan riwayat. Respons berisi tugas terbaru.

### `DELETE /tasks/{id}`

Hanya koordinator. Kirim `{ expectedVersion, reason }`. API mengisi `deleted_at`, menambah versi, dan menyimpan alasan dalam satu transaksi. Data tetap tersimpan. Respons berisi `{ "deleted": true }`.

### `GET /tasks/{id}/history`

Koordinator atau penanggung jawab saat ini dapat membaca riwayat tugas yang tersedia. Respons `{items:[{id,actorId,actorName,action,reason,before,after,createdAt}],total}` diurutkan berdasarkan waktu dan ID riwayat. Riwayat tugas yang dihapus tetap tersimpan.

## Rekam medis

Dokter dapat membaca rekam medis pasien sesuai penugasan. Perawat memakai cakupan bangsal demo dan dapat menambah observasi. Hanya dokter pembuat yang dapat mengubah catatan dokter. Rute baca untuk Admisi hanya mengembalikan data administrasi. API menolak kolom permintaan yang tidak dikenal.

### `GET /medical-records`

Parameter `search` dan `limit` bersifat opsional. API mengembalikan hingga 100 rekam medis terbaru sesuai akses. Bentuk daftar klinis adalah `{items:[{id,patientId,patientName,medicalRecordNo,doctorName,recordDate,diagnosis,treatment,notes,version,createdAt,observationCount}],total}`. Lihat [OpenAPI](../../contracts/openapi.json) untuk respons Admisi.

### `POST /medical-records`

Hanya dokter yang ditugaskan. Kirim `{patientId,complaint,diagnosis,treatment,notes?,recordDate}`. Isi teks wajib dan gunakan `YYYY-MM-DD` untuk `recordDate`. ID pembuat diambil dari sesi. Respons berisi detail rekam medis.

### `GET /medical-records/{id}`

Dokter yang ditugaskan dan perawat dapat membaca detail klinis dengan `observations:[{id,nurseId,nurseName,symptoms,nursingNote,observedAt,temperature,bloodPressure,pulse,respiratoryRate,spo2}]`. `bloodPressure` menggabungkan sistolik dan diastolik seperti `"120/80"`. Nilainya `null` jika pasangan tidak ada. Admisi menerima detail administrasi.

### `PATCH /medical-records/{id}`

Hanya dokter pembuat. Kirim `{expectedVersion,complaint,diagnosis,treatment,notes?,recordDate,reason}`. API mengunci baris dan memeriksa versi. Konflik menghasilkan 409. Dokter selain pembuat menerima 403. Respons berisi rekam medis terbaru beserta observasi.

### `POST /medical-records/{id}/observations`

Hanya perawat. Kirim `{symptoms,nursingNote?,observedAt,temperature?,systolic?,diastolic?,pulse?,respiratoryRate?,spo2?}`. Gunakan RFC 3339 dengan zona waktu untuk `observedAt`. Isi sistolik dan diastolik bersama-sama atau kosongkan keduanya. Batas dan presisi tiap pengukuran ada di [OpenAPI](../../contracts/openapi.json) dan DTO. Pemeriksaan hanya memvalidasi nilai. API menyimpan observasi dan tanda vital dalam satu transaksi dan mengembalikan rekam medis terbaru.

Isian klinis yang ditolak menghasilkan 422 dengan pesan berbahasa Indonesia. Sesi yang tidak tersedia menghasilkan 401, izin yang tidak sesuai menghasilkan 403, dan rekam medis di luar cakupan menghasilkan 404.
