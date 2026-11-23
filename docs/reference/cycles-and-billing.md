# API rekap rawat inap, notifikasi, dan tagihan

Awalan API adalah `/api/v1`. Gunakan kuki sesi untuk semua permintaan. Untuk mengubah data, sertakan token CSRF sesi dan header `Origin` yang sama dengan aplikasi. Kunci JSON menggunakan camelCase. ID berupa teks opak, waktu menyertakan zona, dan nominal memakai teks desimal. Lihat [kontrak OpenAPI](../../contracts/openapi.json).

## Rekap rawat inap

### `GET /cycles`

Dokter dan perawat menerima rekap sesuai penugasan. Admisi menerima `403 FORBIDDEN`. Respons memuat hingga 100 data terbaru dan totalnya.

```json
{"items":[{"id":"cyc-1","patientId":"pat-1","patientName":"Siti Rahmawati","medicalRecordNo":"RM-004218","placementId":"plc-1","room":"Melati 01","doctorName":"dr. Hendra Wijaya","nurseName":"Dina Putri","status":"in_care","version":2,"createdAt":"2026-10-29T10:00:00Z","requests":[]}],"total":1}
```

### `POST /cycles` (PERAWAT)

Rekap tanpa penempatan berstatus `pending`. Jika memilih penempatan aktif milik pasien atau membuat penempatan baru, rekap berstatus `assigned`. Gunakan dokter `DOKTER` yang aktif. Batas satu rekap aktif per pasien mencegah rekap ganda.

```json
{"patientId":"pat-1","doctorId":"usr-doctor-1","placementId":"plc-1"}
```

Respons `201` berisi `id`, `patientId`, `placementId`, `doctorId`, `nurseId`, `status`, dan `version`.

### `GET /cycles/{id}`

Hanya perawat atau dokter yang ditugaskan dapat membaca rekap beserta ID petugas dan riwayat pengajuan.

### `PATCH /cycles/{id}` (PERAWAT yang ditugaskan)

Urutan status adalah `pending -> assigned -> in_care`. Saat rekap masih `pending`, kaitkan penempatan aktif sebelum melanjutkan status. Jika penempatan belum ada, permintaan melanjutkan status menghasilkan 409 dan versi tetap sama. Sertakan versi terbaru.

```json
{"status":"assigned","expectedVersion":1}
```

Contoh hasil adalah `{"ok":true,"status":"assigned","version":2}`. Perubahan yang melanggar urutan atau memakai versi lama ditolak. Periksa data terbaru sebelum mengirim kembali.

### `POST /cycles/{id}/requests` (PERAWAT yang ditugaskan)

Ajukan `extend` atau `release` untuk pasien yang sedang dirawat. Isi alasan. Selesaikan permintaan sebelumnya jika masih menunggu keputusan.

```json
{"kind":"extend","requestedEnd":"2026-11-05","reason":"Dokter meminta observasi tambahan."}
```

Untuk pelepasan, kirim `{"kind":"release","requestedEnd":null,"reason":"Kondisi sudah stabil."}`. Respons `201` memuat ID permintaan, ID rekap, jenis, tanggal, alasan, dan `status:"pending"`. Hanya satu permintaan per rekap dapat menunggu keputusan.

### `POST /cycles/{id}/requests/{requestId}/decision` (DOKTER yang ditugaskan)

Isi catatan keputusan dan sertakan versi rekap saat ini.

```json
{"decision":"approve","note":"Jadwal observasi dilanjutkan.","expectedVersion":3}
```

`decision` menerima `approve` atau `reject`. Saat disetujui, API menyimpan status permintaan, perubahan penempatan atau rekap, serta notifikasi perawat dalam satu transaksi. Perpanjangan harus melewati jadwal aktif dan memenuhi kapasitas setiap hari. Pelepasan mempersingkat penempatan yang sudah dimulai hingga hari ini menurut waktu fasilitas. Tugas aktif mendatang menghalangi pelepasan. Penolakan mencatat keputusan dan mempertahankan penempatan serta status rekap. Contoh respons adalah `{"ok":true,"status":"approved","version":4}`. Jika terjadi konflik, transaksi tidak menyimpan perubahan sebagian.

## Notifikasi

### `GET /notifications`

Respons memuat hingga 50 notifikasi milik pengguna, mulai dari yang terbaru.

```json
{"items":[{"id":"ntf-1","cycleId":"cyc-1","message":"Permintaan extend disetujui.","readAt":null,"createdAt":"2026-10-29T10:15:00Z"}],"total":1}
```

### `POST /notifications/{id}/read`

Menandai notifikasi milik pengguna sebagai sudah dibaca. Pengulangan tindakan mempertahankan hasil yang sama. Notifikasi yang hilang atau milik akun lain menghasilkan 404.

## Tagihan

Hanya ADMISI dapat membaca daftar dan detail, membuat tagihan, atau mengubah status pembayaran. Respons berisi identitas pasien dan tagihan. Isi klinis tidak disertakan.

### `GET /invoices?search=&status=&limit=`

Cari nama pasien, nomor rekam medis, atau ID tagihan. Filter `status` menerima `unpaid|paid`. Batas bawaan 50 dan maksimal 100. Nilai `total` menghitung baris pada halaman hasil. Tiap baris memuat ID, identitas, penempatan, kepesertaan BPJS saat tagihan dibuat, `totalAmount`, `coveredAmount`, `payableAmount`, status pembayaran, versi, waktu, dan jumlah rincian.

### `POST /invoices`

Sertakan 1–30 rincian. Gunakan nominal desimal nonnegatif dalam bentuk teks dengan maksimal dua angka pecahan. Server menghitung subtotal dan total. Nilai jaminan BPJS tidak boleh melebihi total dan harus nol bagi pasien tanpa BPJS.

```json
{"patientId":"pat-1","placementId":"plc-1","coveredAmount":"500000.00","lines":[{"description":"Kamar kelas 2 (malam)","quantity":2,"unitPrice":"650000.00"}]}
```

Respons `201` memuat ID, identitas pasien, kepesertaan BPJS saat tagihan dibuat, total, `status:"unpaid"`, `version:1`, dan rincian tersimpan. Tagihan, rincian, dan riwayat dibuat dalam satu transaksi.

### `GET /invoices/{id}`

Respons berisi identitas untuk tagihan, rincian layanan, subtotal, total, dan riwayat perubahan.

### `PATCH /invoices/{id}`

Kirim minimal satu perubahan pada status pembayaran, seluruh rincian, atau nilai jaminan. Sertakan alasan yang tidak kosong dan paling banyak 500 karakter, serta versi saat ini.

```json
{"status":"paid","reason":"Bukti pembayaran dicocokkan.","expectedVersion":1}
```

Jika rincian atau jaminan berubah, server menghitung ulang dan mengembalikan nominal dalam bentuk teks desimal. Metadata `roomItemId` dan `kind` tetap dipakai jika tidak dikirim pada rincian pengganti yang bersesuaian. API mengunci baris dan menyimpan perubahan bersama riwayat. Tagihan lunas mengunci rincian keuangan. Versi lama dan penetapan status yang sama ditolak.

## Kontrak pesan kesalahan

```json
{"error":{"code":"CONFLICT","message":"Data sudah berubah. Muat ulang untuk melihat data terbaru, lalu periksa perubahan Anda sebelum menyimpan kembali."}}
```

Isian tidak valid menghasilkan `422 VALIDATION_FAILED`. Sesi yang tidak ada atau berakhir menghasilkan 401, izin ditolak menghasilkan 403, dan data yang tidak tersedia menghasilkan 404. Konflik versi atau aturan kerja menghasilkan 409. Respons tidak meneruskan pesan SQL mentah atau informasi klinis.

## Penyesuaian rancangan awal

Aplikasi menyimpan pengajuan dan hanya mengubah status yang berlaku setelah dokter menyetujui. Petugas mengisi nilai jaminan dan pembayaran pada demo. Pemeriksaan kapasitas dan tugas menjaga konsistensi data saat penempatan diperpanjang atau dipersingkat.
