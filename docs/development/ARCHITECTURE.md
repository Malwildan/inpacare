# Arsitektur API

NestJS mengelompokkan kode berdasarkan lapisan. Di dalam tiap lapisan, berkas dikelompokkan menurut modul. Rute publik, payload, tabel, dan identitas migrasi mengikuti kontrak API.

```text
apps/api/src/
  domain/             business rules and task behavior model; plain TypeScript
  application/        use cases, input types and persistence ports
  infrastructure/     TypeORM entities, SQL stores, transactions, migrations and security
  presentation/http/  controllers, request DTOs, guards, middleware and error filter
  composition/        NestJS modules and factory providers
  database/cli.ts     stable operational CLI entry point
  main.ts             HTTP bootstrap
  app.module.ts       application composition root
```

## Alur pembaruan tugas

Mulai dari `presentation/http/tasks/tugas.controller.ts`, lalu buka `application/tasks/tugas.use-cases.ts`. Kasus penggunaan mengambil tugas dan penempatan yang terkunci, memeriksa versi serta penanggung jawab aktif, lalu memakai `domain/tasks/tugas-perawatan.ts` untuk mengubah kolom dan status. Kasus penggunaan menyimpan perubahan bersama riwayat sebelum mengembalikan hasil.

Query SQL ada di `infrastructure/database/repositories/tasks/typeorm-tugas.store.ts`. Kontrak `application/tasks/tugas-store.port.ts` mendefinisikan operasi tanpa `EntityManager`, SQL, atau DTO HTTP. Unit kerja memulai transaksi.

Model tugas menyimpan keadaan secara privat dan menyediakan metode perubahan. Entitas ORM ada di `infrastructure/database/entities/tasks/tugas-perawatan.orm-entity.ts`. Modul domain juga menangani aturan seperti perhitungan tagihan dan tanggal penempatan. Tambahkan model domain jika data referensi atau riwayat memiliki perilaku yang perlu dimodelkan.

## Model domain dan entitas ORM

Jalur relatif terhadap `src/domain/` dan `src/infrastructure/database/entities/`. Entitas ORM memetakan kolom dan relasi. Berkas domain berisi aturan kerja yang dapat diuji terpisah.

| Cakupan | Model atau aturan domain | Entitas penyimpanan |
| --- | --- | --- |
| Petugas dan izin | `auth/actor.ts`, `auth/permissions.ts` | `auth/pengguna.orm-entity.ts`, `dokter`, `perawat`, `sesi` |
| Tugas perawatan | `tasks/tugas-perawatan.ts`, `tasks/tugas.policy.ts` | `tasks/tugas-perawatan.orm-entity.ts`, `riwayat-tugas` |
| Biaya ruang | `rooms/room-cost.ts` | `rooms/ruang-inap.orm-entity.ts`, `item-ruangan` |
| Tanggal penempatan | `placements/placement-period.ts` | `placements/penempatan-pasien.orm-entity.ts` |
| Status rekap | `cycles/cycle-transition.ts` | `cycles/rekap-pasien.orm-entity.ts`, `permintaan-siklus`, `audit-siklus` |
| Tanda vital | `medical-records/vital-signs.ts` | `medical-records/rekam-medis.orm-entity.ts`, `kondisi-pasien`, `tanda-vital`, `audit-medis` |
| Penghitungan tagihan | `billing/invoice-total.ts` | `billing/tagihan.orm-entity.ts`, `detail-tagihan`, `riwayat-tagihan` |
| Data pasien dan referensi | Tipe aplikasi dan kontrak akses pasien | `patients/pasien.orm-entity.ts` dan query atas entitas terkait |
| Notifikasi | Tipe aplikasi dan kontrak penyimpanan notifikasi | `notifications/notifikasi.orm-entity.ts` |

Nama entitas singkat berada di direktori pada baris yang sama dan memakai akhiran `.orm-entity.ts`. Proyeksi referensi berasal dari query atas tabel yang ada.

## Arah dependensi

- Domain memakai kode domain dan pustaka aritmetika yang ada. NestJS, TypeORM, dan HTTP berada di lapisan luar.
- Application memakai domain dan kontrak aplikasi. Masukan dan keluaran memakai data TypeScript biasa. Pustaka standar membuat ID opak dan tanggal lokal fasilitas.
- Infrastructure menerapkan kontrak aplikasi dengan TypeORM, PostgreSQL, Argon2, dan sesi opak.
- Presentation memakai kontrak aplikasi dan pustaka HTTP untuk validasi serta adaptasi permintaan. Infrastruktur menangani akses basis data.
- Composition membuat adaptor dan kasus penggunaan, lalu menghubungkannya dengan controller dan guard melalui factory provider. Dekorator NestJS berada di lapisan luar aplikasi.

Uji arsitektur memeriksa impor langsung dan dinamis, direktori lama, serta lokasi SQL. Uji ini berjalan bersama uji unit API.

## Transaksi dan kesalahan

`TypeOrmUnitOfWork.run()` memberikan EntityManager yang sama ke seluruh penyimpanan dalam satu transaksi. Perubahan, riwayat, dan notifikasi yang diwajibkan disimpan atau dibatalkan bersama. Urutan penguncian ialah pasien → ruang yang telah diurutkan → penempatan → rekap → permintaan → tugas. Bandingkan versi setelah memperoleh kunci.

Kesalahan domain membawa kode dan pesan. Filter HTTP mempertahankan status dan bentuk `{error:{code,message}}`. DTO memberi pesan kolom yang dikurasi. Filter menangani kesalahan PostgreSQL di lapisan luar dan menjaga agar pesan teknis tidak muncul dalam respons. Server memeriksa sesi, origin, CSRF, dan peran.

## Pengoperasian dan pemeriksaan

Gunakan `dist/main.js` dan `dist/database/cli.js`. Migrasi, pengisian data, dan aset SQL ada di `infrastructure/database`. Build membersihkan direktori hasil `dist` API lalu menyalin aset SQL. Jalankan migrasi dan pengisian data secara terpisah dari startup.

Uji berada di `test/architecture`, `test/domain`, `test/application`, `test/contract`, serta `test/integration`. Domain dan aplikasi dapat diuji tanpa PostgreSQL atau NestJS. Penguncian, pembatalan transaksi, skema, dan adopsi memakai basis data sementara. Perilaku eksternal diperiksa melalui HTTP dan Playwright.

`NESTJS_TRACEABILITY.json` mencatat tujuan pemetaan ORM dan aturan kerja secara terpisah. Pemetaan mencakup 17 entitas sumber, 122 atribut, 53 metode controller, dan 30 relasi. Cakupan pengujian perilaku diperiksa terpisah.
