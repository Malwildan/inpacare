# Kontrak API ruang dan penempatan

Awalan API adalah `/api/v1`. JSON memakai camelCase dan ID berupa teks opak. API memeriksa sesi dan peran saat data diubah. Kesalahan memakai bentuk `{ error: { code, message } }`.

## GET /rooms

DOKTER, PERAWAT, dan ADMISI yang sudah masuk dapat membaca hingga 100 ruang, diurutkan menurut nama.

    { "items": [{
      "id": "room-id", "name": "Melati 01", "roomClass": "Kelas I",
      "capacity": 2, "status": "available", "picId": "nurse-id", "picName": "Ns. Ratna",
      "dailyRate": "450000.00", "version": 1, "occupants": 1, "totalCost": "425000.00",
      "items": [{ "id": "item-id", "name": "Bed", "category": "patient_equipment", "quantity": 1, "unitPrice": "425000.00" }]
    }]}

`totalCost` menjumlahkan `quantity * unitPrice`. `occupants` menghitung penempatan aktif yang mencakup hari ini menurut waktu fasilitas. Admisi dapat membaca ruang dan fasilitas.

## GET /rooms/{id}

Mengembalikan objek ruang seperti pada daftar. Ruang yang tidak tersedia menghasilkan 404.

## POST /rooms

Hanya koordinator perawat.

    { "name":"Melati 01", "roomClass":"Kelas I", "capacity":2, "status":"available", "picId":"nurse-id", "dailyRate":"450000.00" }

Nilai bawaan `status` adalah `available` dan `dailyRate` adalah `"0"`. Isi nama dan kelas ruang. Kapasitas 1–20 tempat tidur. Status menerima `available` atau `maintenance`. Tarif per hari harus nonnegatif dengan maksimal dua angka desimal. Nama ganda menghasilkan 409. Respons berisi ruang tersimpan.

## PATCH /rooms/{id}

Hanya koordinator perawat. Bentuk perubahan mengikuti POST dengan `status`, `dailyRate`, dan `expectedVersion` positif yang wajib dikirim. Versi lama menghasilkan 409. Kapasitas baru harus menampung keterisian tertinggi yang sudah dijadwalkan. Respons berisi ruang dengan versi terbaru.

## POST /rooms/{id}/items

Hanya koordinator perawat. Gunakan operasi ini untuk menambah fasilitas atau alat ruang.

    { "name":"Infusion stand", "category":"medical_equipment", "quantity":1, "unitPrice":"125000.00" }

Isi nama dan kategori. Gunakan jumlah 1–10.000 dan harga nonnegatif dengan maksimal dua angka desimal. Respons berisi ruang, daftar fasilitas terbaru, dan `totalCost` yang dihitung server.

## GET /occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD&roomId=...

Dokter melihat pasien sesuai rekap penugasan. Perawat dan Admisi memakai cakupan bangsal demo. Sertakan kedua tanggal dengan `to >= from` dan rentang paling banyak 31 hari. Filter ruang opsional.

    { "items":[{
      "id":"placement-id","patientId":"patient-id","patientName":"Nadia Sari","medicalRecordNo":"RM-24042",
      "roomId":"room-id","roomName":"Melati 01","roomClass":"Kelas I",
      "startsOn":"2026-10-20","endsOn":"2026-10-25","status":"active","version":1
    }], "from":"2026-10-19", "to":"2026-10-25" }

Hasil diurutkan menurut ruang, tanggal masuk, dan pasien. Kedua tanggal dihitung. Koordinator dapat menyertakan penempatan batal dengan `includeCancelled=true`. Penempatan batal tidak mengisi kapasitas.

## POST /placements

Perawat dapat membuat penempatan awal untuk pasien sesuai akses.

    { "patientId":"patient-id", "roomId":"room-id", "startsOn":"2026-10-20", "endsOn":"2026-10-25" }

Pasien dan ruang harus tersedia. Tanggal selesai sama dengan atau setelah tanggal masuk, dengan selisih maksimal 365 hari atau 366 tanggal jika kedua batas dihitung. Ruang dalam pemeliharaan, benturan penempatan pasien, atau kapasitas penuh menghasilkan 409. Kapasitas diperiksa pada setiap tanggal. API mengunci pasien lalu ruang dan menyimpan penempatan dalam satu transaksi. Isian tanggal yang ditolak menghasilkan 422. Contoh bentuk hasil adalah `{ id, patientId, roomId, startsOn, endsOn, status:"active", version:1 }`.

## Ubah, batalkan, dan lihat riwayat

Koordinator menggunakan `PATCH /placements/{id}` atau `DELETE /placements/{id}` dengan alasan dan `expectedVersion`. Rekap atau tugas aktif menghalangi pembatalan. Perubahan tanggal yang terkait rekap mengikuti keputusan dokter. Riwayat perubahan dan pembatalan tersedia di `GET /placements/{id}/history`. Kalender menampilkan tujuh tanggal per pekan.
