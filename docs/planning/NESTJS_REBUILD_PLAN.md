# Rencana rebuild InpaCare: NestJS + TypeORM + PostgreSQL

Tanggal rencana: 2 November 2026. Implementasi berada di `feat/nestjs-rebuild`, dengan PR menuju `rebuild/nestjs`. Lihat [keputusan final](NESTJS_DECISIONS.md), [status implementasi](NESTJS_IMPLEMENTATION.md), dan [bukti validasi](../validation/nestjs-rebuild.json). Bagian baseline di bawah merekam kondisi saat perencanaan; implementasi direkonsiliasi dari `main` terbaru (`ccb4638`).

**Arahan:** ganti backend Rust langsung dengan TypeScript/NestJS di branch `rebuild/nestjs`. Backend baru menempati `apps/api`. Frontend SvelteKit dipertahankan dan dilengkapi untuk fungsi Modul 2 yang belum ada. Riwayat Git menjadi referensi backend Rust; tidak ada rancangan dua backend aktif atau pembagian trafik per modul.

## 1. Baseline, hasil yang dituju, dan batas pekerjaan

- Branch `rebuild/nestjs` dibuat dari checkout lokal `caab242adf3e31215c77ad29337d23c79ad8e958`. Dua belas file frontend yang sudah dimodifikasi pengguna ikut terbawa, tanpa di-commit atau ditimpa. Branch baru masih lokal.
- `origin/main` diverifikasi pada `aafc0bd6f1094c07017d3b4ae849538ceb8a8d87`; salinan commit tetap tersedia di `.local/audit-modul2-20261102/repo/`. Perubahan remote yang relevan harus direkonsiliasi pada P0, terutama session, kontrak, deployment, dan CI. Jangan memperlakukan checkout lokal lama sebagai versi remote terbaru.
- [Modul 2](https://docs.google.com/document/d/1MDNjrTaaqyml-3hnH4L3X_hsodEB5lYt0HRwzQCMRjs/edit?tab=t.35pzydmpv5ma) adalah sumber class, atribut, relasi, skenario, dan pseudocode. Capture yang sudah diperiksa: SHA-256 `9a1023bbe4c391d5baf20aa865da0923fe5fb2462c9c7d01ebd8656a963716ad`; verifikasi ulang saat implementasi dimulai.
- [Audit baseline](../../output/audit-modul2-2026-11-02.md) mencakup 14 file Rust, 17 entity konseptual, 19 tabel, serta 38 operasi HTTP pada 25 path API. Angka tersebut baseline, bukan target kelengkapan.
- Hasil akhir: seluruh operasi dokumen mempunyai mapping class → method → file → endpoint/UI → pengujian; perilaku yang berbeda dari dokumen harus diberi alasan dan keputusan yang tercatat.
- Pekerjaan ini mencakup backend, perubahan schema yang diperlukan, integrasi frontend untuk operasi yang hilang, kontrak, tests, dan tooling peluncuran. Tidak menambah integrasi rumah sakit/BPJS/pembayaran nyata atau CRUD akun/master baru tanpa dasar kebutuhan.
- Dokumen ini dan lampiran traceability adalah hasil pekerjaan perencanaan. Tidak menghapus source Rust, memasang dependency, menjalankan migrasi DB, mengubah layanan aktif, atau melakukan deployment pada tahap ini.

## 2. Arsitektur target

Satu aplikasi NestJS modular, satu PostgreSQL, dan frontend SvelteKit yang sudah ada:

```text
Browser / SvelteKit SSR
  → /api/v1/* melalui proxy SvelteKit
  → NestJS controller + autentikasi/otorisasi + validasi DTO
  → operasi modul: aturan bisnis, transaksi, akses record
  → TypeORM entity / repository / query builder
  → PostgreSQL
```

Gunakan controller class dengan nama yang dapat ditelusuri ke dokumen, entity class bernama Indonesia, serta URL/camelCase JSON lama untuk kompatibilitas UI. Contoh: `TugasController.buatTugas` menangani `POST /api/v1/tasks`; entity `TugasPerawatan` memetakan tabel `tasks`.

Setiap modul memiliki interface kecil untuk operasi yang dipakai modul lain. Detail query, permission, dan transaksi tetap di dalam implementation modul. Tidak membuat repository interface generik, base controller, event bus, microservice, atau lapisan pembungkus yang hanya meneruskan satu pemanggilan.

Struktur yang direncanakan:

```text
apps/api/
  package.json, tsconfig.json, nest-cli.json
  src/
    main.ts, app.module.ts
    database/
      data-source.ts
      migrations/
      seed.ts
    common/
      auth/                 actor context, session/role guard
      errors/               error envelope + exception filter
      http/                 origin/CSRF, body limit, headers
    modules/
      auth/                 Pengguna, Dokter, Perawat, Sesi, AuthController
      patients/             Pasien dan lookup/context sesuai izin
      reference/            penggabungan lookup, bukan salinan entity
      rooms/                RuangInap, ItemRuangan, RuangInapController
      placements/           PenempatanPasien, AssignRuanganController
      tasks/                TugasPerawatan, RiwayatTugas, TugasController
      medical-records/      RekamMedis, KondisiPasien, TandaVital,
                            RekamMedisController
      cycles/               RekapPasien, PermintaanSiklus,
                            RekapPasienController, DashboardSiklusController
      billing/              Tagihan, DetailTagihan, RiwayatTagihan,
                            TagihanController
      notifications/        Notifikasi, baca/tandai, penulisan internal
  test/
```

Pola isi modul, dengan `tasks` sebagai contoh:

```text
tasks.module.ts
tugas.controller.ts
tugas.service.ts            orkestrasi transaksi/aturan lintas entity
tugas.policy.ts             izin per tindakan/record
entities/tugas-perawatan.entity.ts
entities/riwayat-tugas.entity.ts
dto/buat-tugas.dto.ts
dto/perbarui-tugas.dto.ts
dto/filter-tugas.dto.ts
```

Gunakan repository TypeORM bawaan. File query khusus ditambahkan hanya jika ada query kompleks yang berulang. Jangan menyalin entity Pasien/Perawat/RuangInap ke setiap modul pemakai. Modul yang membutuhkan transaksi lintas domain memakai EntityManager transaksi yang sama; tidak membuka transaksi baru tersembunyi di helper.

## 3. Keselarasan dengan class diagram

Lampiran [NESTJS_TRACEABILITY.json](NESTJS_TRACEABILITY.json) berisi target file untuk 17 entity, 8 controller/53 method sumber, 122 atribut dan 30 relasi dari tabel data §2.5, serta 38 operasi HTTP baseline. Masing-masing mempunyai pemetaan rencana dan skenario uji; signature/visibility serta rekonsiliasi perbedaan §2.4–§2.5 dibekukan pada P0. Seluruh status implementasi masih `planned` dan bukti eksekusi `not_run`.

Session-current, logout, dan health dicatat sebagai operasi teknis tambahan yang dipertahankan, bukan method baru yang diklaim berasal dari AuthController pada diagram. Untuk dua controller siklus, hindari duplikasi handler method/path: pertahankan GET `/cycles` legacy pada RekapPasienController; DashboardSiklusController mendapat GET `/cycles/dashboard` dan detail request yang eksplisit. Uji prioritas route statis terhadap `/cycles/:id`. Composite read konteks pasien-tagihan dan operasi internal lookup juga dipetakan di lampiran, sehingga tidak perlu class/controller kosong untuk setiap nama method sumber.

| Unsur dokumen | Aturan implementasi |
|---|---|
| Boundary seperti PapanTugasUI/FormTugasUI | Dipetakan ke komponen, form, dialog, dan event handler SvelteKit; tidak dibuat class backend palsu. |
| Controller dan method public | Nama controller mengikuti dokumen. Method HTTP dipetakan eksplisit ke operasi dokumen, termasuk yang dipecah menjadi command berbeda. |
| Entity dan atribut | Satu file entity per class data, kolom dan relasi lengkap; DTO request/response berbeda dari entity persistence. |
| Atribut private/method public | Gunakan TypeScript private dan method/accessor yang sesuai bila bisa dihidrasi oleh ORM. Buktikan dengan satu entity nyata pada P1. Jangan menganggap field publik TypeORM otomatis sama dengan atribut privat UML. |
| Method model seperti simpan/findById | Gunakan operasi persistence TypeORM yang dimapping ke method sumber; model tidak perlu mengetahui HTTP. Method perilaku seperti transisi status/subtotal tetap eksplisit. Pemindahan method persistence ke repository dicatat sebagai adaptasi, bukan kesesuaian literal. |
| Service/repository/guard/DTO/module | Tambahan teknis framework; jangan dinyatakan sebagai class yang sudah ada di dokumen. |
| Nama Ruangan/RuangInap dan controller yang berbeda antara gambar/pseudocode | Simpan alias sumber pada traceability, gunakan satu class canonical. Hindari duplikasi class karena perbedaan penamaan. |

Jika spike ORM tidak dapat mempertahankan visibility yang dipilih secara sederhana, catat adaptasi visibility beserta contoh dan uji sebelum menyalin pola ke entity lain. Jangan menghasilkan dua set model/persistence untuk seluruh domain hanya untuk mengakali nama/visibility tanpa kebutuhan nyata.

## 4. Kontrak teknis yang dipertahankan

- Prefix `/api/v1`, URL lama, format error `{error:{code,message}}`, cookie session, CSRF cookie/header, status HTTP, dan tipe response yang dipakai frontend.
- Opaque ID bertipe string: jangan memaksa semua ID lama menjadi UUID. Entity bernama Indonesia bisa tetap memakai nama tabel/kolom Inggris dengan mapping eksplisit.
- Uang PostgreSQL `numeric(15,2)` dan JSON decimal string. Gunakan perhitungan decimal exact atau SQL; jangan memakai JavaScript Number untuk total tagihan. Pertahankan harga/snapshot historis.
- PostgreSQL date untuk tanggal tanpa jam; timestamptz untuk waktu kejadian; presentation fasilitas Asia/Jakarta. Hari keluar penempatan tetap inklusif. Uji batas hari, bukan sekadar konversi string.
- Input mutasi memakai DTO runtime validation yang menolak field tak dikenal; tipe TypeScript saja tidak memvalidasi input HTTP. DTO response eksplisit mencegah password hash, session hash, atau relasi internal bocor.
- Autentikasi default wajib untuk endpoint domain. Login dan health adalah pengecualian eksplisit. Actor berasal dari session server, bukan id/peran yang dikirim client.
- Pertahankan Argon2 password hash, random opaque session, SHA-256 token hash, revocation logout, cookie HttpOnly/SameSite/Secure sesuai origin. Tidak mengganti model autentikasi menjadi JWT sekadar karena mengganti framework.
- Session lifetime: checkout lokal mencatat 8 jam, sedangkan GitHub `aafc0bd` memakai 30 hari. Baseline rencana mengambil 30 hari sesuai versi GitHub terbaru; uji interoperabilitas expiry/cookie dan dokumentasikan pilihan ini di P0. Hash dan masa berlaku session lama tidak direset tanpa alasan.
- Origin/CSRF berlaku untuk seluruh mutasi termasuk logout. Daftar origin terpercaya dan trust proxy dikonfigurasi eksplisit; jangan mempercayai sembarang forwarded-host dari request publik. Role guard tidak menggantikan izin pemilik record/PIC/pasien.
- `expectedVersion` diwajibkan pada perubahan record yang dapat bersaing. Lakukan compare-and-write atomik atau lock lalu compare. `@VersionColumn` sendiri bukan bukti konflik stale update sudah ditolak.
- Urutan lock lintas domain konsisten: pasien → ruang (urut ID) → penempatan → rekap → permintaan → tugas (urut ID). Baca ID keterkaitan dahulu, ambil lock, lalu validasi ulang kondisi di dalam transaksi. Hindari satu command mengambil cycle→room dan command lain room→cycle.
- Semua audit/history/notification wajib yang terkait mutasi ditulis dalam transaksi yang sama melalui transactional EntityManager. Tidak ada dual write atau audit yang baru ditulis setelah commit.
- Pertahankan `/health`, batas body, no-store untuk data pengguna, shutdown yang menutup server/pool, pagination/bounded reads, dan tidak merekam secret/body klinis di log.

## 5. Pilihan dependency dan kompatibilitas

Gunakan npm workspace tambahan `apps/api`, PostgreSQL yang sudah dipakai, dan Node 24 sesuai `.nvmrc`. Tidak menaikkan major PostgreSQL sebagai bagian rebuild ini.

Metadata registry diperiksa 2 November 2026: `@nestjs/core 12.3.2`, `@nestjs/typeorm 12.0.2`, `typeorm 1.1.2`, dan TypeScript terbaru `7.0.2`. Integrasi Nest TypeORM tersebut mendeklarasikan peer `typeorm ^0.3.0 || ^1.0.0-dev` dan Nest 10/11/12. TypeORM 1.1.2 mensyaratkan Node `^20.19.0 || ^22.13.0 || >=24.11.0`. Ini metadata, belum hasil instalasi/build proyek.

P1 memilih dan mengunci satu kombinasi yang benar-benar lolos install/build/entity/transaction test. Periksa versi Node aktual: `.nvmrc` berisi 24 saja belum membuktikan patch-nya memenuhi minimum. Pakai major Nest yang sama untuk common/core/platform/testing. Jangan memakai `--force`/`--legacy-peer-deps` untuk menutupi konflik. TypeScript frontend tidak dinaikkan otomatis ke 7; backend memilih compiler kompatibel dan diuji bersama workspace.

Dependency yang dibutuhkan sesuai keputusan P1: Nest core/common/platform, `@nestjs/typeorm`, TypeORM, `pg`, reflect-metadata/rxjs, DTO validation, Argon2, dan decimal arithmetic. OpenAPI tetap di `contracts/openapi.json` sebagai kontrak canonical selama rebuild; ekspor Swagger opsional tidak menjadi sumber kedua yang dibiarkan berbeda. Jangan menambah Redis/queue untuk alur sinkron yang sudah cukup dengan PostgreSQL.

## 6. Tahapan implementasi dan kriteria selesai

Tahapan berikut adalah urutan pekerjaan pada branch baru, bukan pengalihan trafik modul demi modul. Backend Nest menggantikan `apps/api` di P1; aplikasi belum dinyatakan selesai sebelum P8. Tidak menjalankan backend Rust sebagai pasangan runtime.

### P0 — Bekukan kebutuhan dan baseline

1. Rekonsiliasi commit remote `aafc0bd` dengan base lokal dan perubahan frontend pengguna. Simpan diff/hash; jangan reset/stash/drop perubahan pengguna secara tersembunyi atau memasukkan dokumen privat ke commit publik.
2. Verifikasi ulang Modul 2, hash capture, daftar class/method/atribut/relasi, dan inventaris route terbaru. Lengkapi traceability per baris: signature/return/visibility sumber → file/symbol target → method/path HTTP atau operasi internal → UI handler/state → scope izin → skenario uji. Lengkapi juga setiap mapping atribut, tipe, nullability, foreign key dan kardinalitas. `null`, daftar kosong, atau status `to_freeze_P0` bukan mapping yang sudah selesai.
3. Bekukan keputusan domain §7; pilih nama canonical serta adapter status/ID. Bedakan kewajiban dokumen dari aturan demo lama.
4. Ambil karakterisasi kontrak dari OpenAPI dan fixture sintetis tests yang ada. Simpan kasus bug sebagai expected corrected behavior, bukan golden output yang harus disalin.
5. Rekam baseline runtime/performance dari bukti yang tersedia; bila belum ada pengukuran terkini, tandai belum tersedia. Jangan mengarang target throughput atau estimasi tanggal.

**Selesai bila:** source of truth/commit/decision register jelas, perubahan lokal terjaga, dan seluruh baris sumber mempunyai mapping rencana atau keputusan penyimpangan eksplisit. Pemeriksaan coverage harus gagal untuk class/method/atribut/relasi yang belum dipetakan. Bukti eksekusi test masih `not_run` pada P0; daftar nama/file saja tidak menutup tahap ini.

### P1 — Ganti apps/api dengan fondasi NestJS

1. Pada branch ini, ganti source/manifest Rust di `apps/api` dengan NestJS. Source lama tetap tersedia dari commit Git; tidak dipindah menjadi aplikasi kedua.
2. Tambahkan npm workspace `apps/api` dan perintah API dev/check/build/test/migration. Root script frontend lama tetap jelas; root check/build nantinya mencakup kedua workspace.
3. Pasang app bootstrap, config validation, global prefix, exception filter, validation pipe, session/role guards, origin/CSRF, dan koneksi database. Implementasi auth lengkap diselesaikan di P2; endpoint domain yang belum dibuat tidak dibuka tanpa guard.
4. Spike satu entity nyata: hydrate/save/query, decimal/date/nullability, private/accessor serialization, transaksi rollback, dan version conflict. Gunakan DB disposable.
5. Tetapkan `synchronize:false` dan migrasi eksplisit; startup biasa tidak menjalankan perubahan schema otomatis. Health memberi status koneksi DB tanpa secret.

**Selesai bila:** npm install bersih tanpa peer override, backend build/start, health DB, input invalid ditolak, entity/transaksi spike lulus, serta tidak memerlukan toolchain Rust untuk proses baru.

### P2 — Schema, autentikasi, dan referensi

1. Buat seluruh entity/mapping baseline yang akan dipakai modul berikut; gunakan baseline SQL beserta index/constraint penting, bukan hanya generate tabel dari decorator.
2. Implementasikan Pengguna/Dokter/Perawat/Pasien/Sesi, login/session/logout, lookup/reference/context, actor dan policy bersama. Profil staf tetap entity terpisah; jangan menggabungkan semua class menjadi satu User generik.
3. Jalankan adopsi migration history di DB salinan, backfill relasi profil dari user ID, dan penambahan field yang hilang sesuai §8.
4. Verifikasi password hash Argon2 dan session lama yang masih valid, expiry, logout revocation, role/coordinator, CSRF, akses pasien, dan response DTO.

**Selesai bila:** seluruh peran bisa login dan ditolak sesuai matriks; data lama masih terbaca; schema baru bisa dibuat dari nol maupun diadopsi dari salinan DB lama.

### P3 — Ruang dan penempatan

1. Implementasikan RuangInapController dan AssignRuanganController beserta model/lookup sesuai dokumen. Preserve read/create/edit ruang, item dan occupancy lama.
2. Lengkapi hapus/arsip ruang, edit/hapus item, dan pembatalan penempatan. Reschedule memakai validasi interval/kapasitas yang sama jika termasuk scope UI yang dibekukan di P0.
3. Pisahkan `biayaTotal` inventory dari `dailyRate`; hitung subtotal item secara exact. Ketersediaan/occupied diturunkan dari rentang penempatan, bukan menyamakan semua status entitas.
4. Terapkan transaksi dan lock pasien/ruang untuk booking, cancel, dan reschedule. Command yang masih akan menyisakan tugas/rekap tidak konsisten harus ditolak dengan pesan yang bisa ditindaklanjuti.
5. Lengkapi UI rooms/calendar dengan form, konfirmasi, empty/error/conflict state. Pertahankan edit visual pengguna.

**Selesai bila:** booking bersamaan tidak melebihi kapasitas, pasien tidak double-book, boundary tanggal benar, cancel/delete yang diizinkan bekerja, dan relasi historis tidak hilang.

### P4 — Tugas perawatan

1. Implementasikan lima operasi utama TugasController, RiwayatTugas, cekPenempatan, dan cekPerawatAktif; history ditulis juga saat create.
2. Lengkapi edit detail/judul/deskripsi, prioritas, jadwal, catatan, PIC dan status sesuai hak field. PIC reassignment boleh menjadi command tersendiri dengan mapping ke `perbaruiTugas`.
3. Lengkapi filter pasien/ruang/PIC/status/prioritas/tanggal dan pagination server-side; UI harus benar-benar mengirim filter, bukan menyaring halaman pertama saja.
4. Validasi ulang PIC aktif, kecocokan pasien/ruang dan seluruh rentang tugas di penempatan, version, status, alasan cancel/delete, serta izin PIC lama setelah reassignment.
5. Perbaiki ketidakkonsistenan eligibility setelah siklus released menurut keputusan P0. Jangan menyalin query yang menolak tugas karena ada siklus released historis yang tidak relevan.

**Selesai bila:** dua update memakai versi sama menghasilkan satu sukses/satu konflik; reassignment mencabut akses PIC lama; gagal audit membatalkan mutasi; seluruh field/filter dokumen berfungsi.

### P5 — Rekam medis, kondisi, tanda vital

1. Implementasikan daftar/detail/create/update/delete rekam medis dan operasi kondisi/vital yang digambarkan. Clinical author/patient access selalu diperiksa di backend.
2. Tambah koreksi observasi dan vital lama dengan audit sebelum/sesudah; nurse tidak boleh mengubah diagnosis/tindakan milik dokter. Physical delete catatan klinis tidak menjadi default.
3. Selesaikan pemetaan tekananDarah menjadi sistolik/diastolik, range nilai, waktu, optionality, dan kardinalitas kondisi-vital. Pelihara data lama yang tidak memiliki vital sebagai kasus legacy yang jelas.
4. Implementasikan projection Admisi sesuai keputusan field read-only §7, terpisah dari respons klinis penuh.
5. Lengkapi UI create/edit/correction/delete yang diizinkan dan tangani konflik versi.

**Selesai bila:** hak dokter/perawat/Admisi tidak saling bocor, koreksi dapat ditelusuri, relasi serta legacy exception sesuai keputusan, dan delete tidak merusak riwayat.

### P6 — Rekap siklus, keputusan, notifikasi

1. Implementasikan RekapPasienController dan DashboardSiklusController sebagai class yang dapat ditelusuri meskipun berada dalam satu CyclesModule.
2. Lengkapi tambah/daftar/filter/detail/ubah status/hapus rekap; tambah pengaitan atau penggantian penempatan yang sah untuk rekap pending.
3. Pertahankan permintaan extend/release persisten, hanya dokter penanggung jawab dapat memutuskan, dan notifikasi diwujudkan dalam transaksi yang sama. Mapping `menunggu acc`/status sebelumnya/proposed status harus eksplisit.
4. Extension memeriksa bentrok/kapasitas; release memeriksa tugas dan tanggal; cancellation/deletion tidak meninggalkan penempatan/rekap aktif yang buntu.
5. Lengkapi UI dashboard, request/decision detail, riwayat, notifikasi dan filter server-side.

**Selesai bila:** alur approve/reject/version conflict/notification lulus; rekap tanpa penempatan dapat dipulihkan; booking, task dan cycle tetap konsisten setelah release/cancel/delete.

### P7 — Tagihan

1. Implementasikan seluruh method TagihanController beserta Tagihan, DetailTagihan, RiwayatTagihan dan supporting patient/equipment reads yang diizinkan.
2. Lengkapi edit rincian layanan/item, hitung ulang total, perubahan status pembayaran, hasil verifikasi klaim manual, dan hapus logis dengan log.
3. Tambahkan relasi detail ke item ruangan dan `jenis`; harga/deskripsi historis disnapshot sehingga edit item master tidak mengubah invoice lama.
4. Pertahankan BPJS snapshot dan coverage tercatat, exact decimal server-side, validasi quantity/coverage, version dan history dalam transaksi. Verifikasi manual bukan pemanggilan layanan BPJS.
5. Lengkapi UI invoices untuk perubahan rincian/verifikasi/delete dengan konfirmasi dan state konflik.

**Selesai bila:** hitung ulang exact, hasil klaim tersimpan, perubahan gagal tidak meninggalkan rincian/total/history parsial, dan data historis tetap terbaca.

### P8 — Integrasi, kontrak, dan tooling

1. Jalankan semua 38 operasi baseline yang relevan melalui Nest beserta operasi tambahan yang telah disepakati. Periksa payload/response/status/headers dan izin; cocoknya daftar route saja tidak cukup.
2. Perbaiki kontrak logout Origin/CSRF, schema occupancy, keyword schema invalid, dan update kontrak untuk field/command baru. Generate ulang `api.d.ts`, kurangi penggunaan `any` pada alur yang diubah.
3. Adaptasi tests API Python yang sudah ada agar menargetkan Nest lewat URL/config. Tambahkan kasus gap yang baru, tanpa menyalin test yang mengabadikan bug sebagai perilaku benar.
4. Update `scripts/start.ps1`, `stop.ps1`, `test-api.ps1`, `setup-runtime.ps1`, `.env.example`, root package scripts, dan dokumentasi pengembangan. Test DB harus disposable dan tidak boleh menghapus DB pengguna.
5. Pada jalur hosting yang benar-benar dipertahankan: update native-host/package/deploy scripts, service API, health checks, dan artifact manifest dari ELF menjadi paket Node. Update Dockerfile/Compose yang ada jika tetap didokumentasikan; tidak perlu menginstal Docker/WSL untuk perencanaan atau jalur native.
6. Update `.github/workflows/ci.yml`, path classifier/cache/pre-push dan tests CI terkait. Hapus job Cargo/Rust yang sudah tidak relevan dari branch rebuild setelah diganti checks Nest. Jangan biarkan path `apps/api` diklasifikasikan sebagai Rust saja.
7. Jalankan lint/typecheck/build backend+frontend, integration DB, migration adoption/fresh install, role E2E, concurrency/failure rollback, dan pengukuran beban representatif. Ambil capture baru untuk UI yang berubah; build/DOM bukan bukti visual.

**Selesai bila:** aplikasi berjalan memakai Nest saja, CI menilai stack baru, semua flow lintas modul diuji, dan tiap mapping traceability mempunyai symbol implementasi serta hasil uji aktual atau exception yang disepakati. Coverage gagal jika masih ada baris sumber yang tidak dipetakan atau operasi wajib belum diimplementasikan. Jalur Windows/native Linux yang dijanjikan juga terverifikasi.

### P9 — Peralihan dan rollback yang teruji

1. Rehearsal pada salinan DB dengan paket build dan konfigurasi final; verifikasi backup bisa direstore dan migrasi bisa diaudit.
2. Pada deployment yang kemudian diotorisasi, hentikan writes, hentikan proses lama bila masih ada di host, ambil backup konsisten, jalankan migrasi satu kali dengan migrator tunggal, start Nest, dan arahkan origin/proxy ke Nest.
3. Jalankan health/session/role dan workflow smoke sebelum writes dibuka. Catat commit, versi runtime/dependency, schema version, backup reference, dan hasil smoke.
4. Jika gagal sebelum writes dibuka: hentikan Nest, pulihkan DB snapshot bila schema tidak kompatibel, dan gunakan release/commit Git sebelumnya. Tidak sekadar mengganti binary terhadap schema baru yang belum kompatibel.
5. Jika Nest sudah menerima writes: hentikan writes, identifikasi delta, dan lakukan forward fix atau rekonsiliasi data yang diuji. Jangan restore backup lama dan membuang writes baru tanpa keputusan eksplisit.

**Selesai bila:** peralihan dan pemulihan pernah direhearsal; tidak ada backend Rust yang dibutuhkan oleh aplikasi target; bukti release dan batas yang belum diuji dilaporkan. Deployment, commit, push, dan merge belum dilakukan oleh pekerjaan rencana ini.

## 7. Keputusan domain yang harus dibekukan di P0

Ini rekomendasi engineering untuk menyelesaikan ambiguitas; bukan klaim bahwa semua detail berikut tertulis di dokumen. Keputusan final dicatat sebelum command terkait diimplementasikan.

| ID | Isu | Rekomendasi awal / syarat penerimaan |
|---|---|---|
| R1 | Dokumen punya status/nama peran yang berbeda | Simpan enum wire lama untuk kompatibilitas; mapping label/alias Indonesia eksplisit. Coordinator sebagai kapabilitas Perawat; PIC sebagai assignment. |
| R2 | Hapus fisik vs deleted_at; relasi historis | Default hapus logis/arsip untuk data yang direferensikan; RESTRICT cascade yang dapat merusak klinis/invoice. Tentukan siapa boleh menghapus dan efeknya; tidak menganggap semua entity punya aturan delete yang sama. |
| R3 | Cancel penempatan berpengaruh ke tugas/rekap | Tolak jika masih ada tugas aktif atau rekap yang harus dipindahkan; sediakan tindakan cancel tugas/relink rekap yang sah terlebih dahulu. Tidak mengubah semua status pasien/ruang/rekap menjadi pending secara buta. Perbedaan terhadap narasi GAM dicatat. |
| R4 | Gambar KondisiPasien–TandaVital 1:1; data lama 0..1 | Target write baru mengikuti keputusan kardinalitas yang disepakati; row legacy tanpa vital dilaporkan. Jangan membuat pengukuran palsu. Jika 1:1 wajib, tentukan representasi belum diukur yang sah dan migrasi legacy sebelum klaim kesesuaian penuh. |
| R5 | Menunggu acc pada Rekap vs request terpisah | Pertahankan PermintaanSiklus sebagai tambahan teknis untuk actor/time/decision; tampilkan menunggu acc sebagai projection tanpa mengubah effective state sebelum keputusan. Mapping status sebelumnya/proposed dibuat eksplisit. |
| R6 | Akses read-only Admisi ke rekam medis | Sediakan projection dengan daftar field yang dibekukan; jangan membuka teks klinis penuh secara tidak sengaja. Daftar ini harus diselesaikan untuk memenuhi skenario MARR; larangan seluruh bacaan versi demo tidak dianggap otomatis sesuai dokumen. |
| R7 | FK dokter/perawat memakai users sekarang | Entity mempunyai relasi ke profil Dokter/Perawat. Backfill dari user_id, simpan adapter ID wire lama bila diperlukan; jangan menafsir ulang ID pengguna sebagai ID profil. |
| R8 | Invoice berstatus paid dihapus/diubah nominalnya | Tentukan batas perubahan dan audit sesuai kebutuhan tugas; rekomendasi awal menolak perubahan nominal/hapus saat paid sampai prosedur koreksi dibekukan. Verifikasi klaim disimpan manual; tidak menambah integrasi eksternal. |
| R9 | Penempatan released dipakai ulang | Rekomendasi: penempatan yang siklusnya released tidak dipakai untuk admission baru; admission baru membuat penempatan baru. Koreksi eligibility tugas dan pilihan UI mengikuti aturan yang sama. |
| R10 | Atribut wajib dokumen belum pernah disimpan | Tambah field untuk write baru, laporkan unknown legacy. Jangan mengisi tanggal dibuat, alamat, unit, atau status historis dengan nilai rekaan. Nullability final bergantung data yang benar-benar tersedia. |

Ketidakjelasan sumber tidak menghalangi pekerjaan fondasi yang independen. Namun command dan acceptance yang bergantung pada keputusan tersebut tidak boleh ditandai selesai dengan asumsi tersembunyi.

## 8. Strategi database dan adopsi schema

1. Gunakan database salinan/disposable untuk semua pekerjaan awal. Inventaris schema, row count, PK/FK, index, constraint, nullability dan aggregate uang; jangan menampilkan record pribadi atau kredensial di log.
2. Pertahankan physical table/column baseline sedapat mungkin. Buat initial migration untuk DB baru dengan constraints/indexes baseline yang tetap valid. Gunakan tabel migration Nest sendiri; jangan menghapus history SQLx.
3. Pada DB lama, cocokkan fingerprint schema terhadap baseline yang dikenal, baru tandai initial migration sudah diterapkan dengan mekanisme baseline/fake yang terkontrol. Schema yang berbeda harus menghasilkan diagnostic dan langkah rekonsiliasi, bukan dilewati. Migration delta tidak boleh ditandai fake.
4. Tambahkan delta secara additive: alamat/status pasien, nama profil dokter/perawat (backfill users.name jika cocok), unit perawat, metadata ruang, tanggal rekap, snapshot status sebelum request, verifikasi klaim, deletion/audit markers, relasi item/jenis invoice, dan profil staff FK yang dipilih. Simpan unknown legacy secara jelas; jangan menerapkan NOT NULL sampai backfill yang valid tersedia.
5. Backfill profil staf dengan join deterministik dari user_id; audit unmapped/duplicate links dan role mismatch. Gunakan kolom transisi ketika diperlukan agar nilai lama tetap dapat direkonsiliasi. Hapus kolom lama hanya setelah tidak digunakan dan recovery boundary selesai.
6. Pertahankan ID, password hash, session yang masih valid, task/invoice history, BPJS/price snapshot, dan waktu audit. Recompute untuk validasi, bukan menimpa nilai uang historis tanpa keputusan.
7. Seed hanya eksplisit pada DB demo kosong; rebuild tidak boleh reseed data yang sudah terisi. Jalankan migrasi dengan perintah deployment terpisah dan satu writer, bukan otomatis setiap aplikasi start.
8. Verifikasi sesudah migrasi: jumlah record, mapping ID, integrity FK, total invoice/coverage/payable, history count/order, date intervals dan exception legacy. Uji lagi setelah stop/start Nest.

## 9. Acceptance dan bukti yang wajib

| Area | Bukti minimal yang bermakna |
|---|---|
| Traceability | Semua class/method/atribut/relasi sumber mempunyai implementasi atau penyimpangan eksplisit; tidak ada nama file kosong yang dihitung sebagai selesai. |
| HTTP contract | Method/path, request, response, error code, headers, cookie dan izin diverifikasi terhadap kontrak; contoh occupancy/logout tidak lagi melanggar schema/prasyarat. |
| Authentication | Hash lama bisa diverifikasi; anonymous/expired/inactive ditolak; CSRF/logout/revocation benar; session tetap sesuai lifetime yang dibekukan. |
| Permissions | Dokter, perawat, coordinator/PIC, Admisi diuji positif dan negatif lewat HTTP langsung; mengetahui ID record tidak memberi akses otomatis. |
| Schema/data | Fresh migration dan adoption clone berhasil; FK/kardinalitas/nullability, legacy exception, dan money snapshot diperiksa. |
| Concurrency | Simultaneous placement; task update/reassign vs stale version; approval ganda; invoice edit bersamaan; lock order/deadlock handling. |
| Atomicity | Paksa kegagalan history/notification/detail insert; tidak ada mutasi setengah jadi setelah rollback. |
| Cross-module | Placement → task → medical condition → cycle request/decision → invoice, termasuk cancel/release/delete dan pemulihan rekap pending. |
| Frontend | Perubahan lokal pengguna tetap ada; semua operasi baru punya form/feedback, permission states, dan data tetap ada setelah reload. Capture baru untuk UI yang diubah. |
| Operational | Windows start/stop/test, jalur Linux yang dipertahankan, CI/classifier/build/package/migration health, restart persistence, restore/cutover rehearsal. |
| Performance | Ukur query count/latency pada dataset dan concurrency yang dinyatakan; tidak ada N+1/list tak terbatas. Tetapkan budget yang masuk akal dari baseline, bukan menjanjikan setara Rust tanpa pengukuran. |

Perintah berikut adalah kontrak script yang akan dibuat pada implementasi, belum tersedia seluruhnya sekarang:

```text
npm ci
npm run check:api
npm run build:api
npm run test:api:unit
npm run test:api:integration
npm run test:api:contract
npm run types:api
npm run check
npm run build
npm run test:e2e
npm run test:ci
```

Jalankan pengujian sesuai modul yang diubah sepanjang development; seluruh release gate dijalankan di P8/P9. Pengujian yang ada tidak dianggap lulus hanya karena filenya tersedia. Gunakan PostgreSQL nyata untuk lock/transaction tests, bukan SQLite atau mock repository sebagai penggantinya.

## 10. Urutan kerja berikutnya

Mulai dari P0, lalu P1–P2. Setelah auth/reference/schema stabil, kerjakan P3 → P4 → P5 → P6 → P7, kemudian P8 dan P9. Dependensi transaksi cancellation/release yang membutuhkan tasks/cycles diselesaikan sebagai acceptance lintas modul di P6/P8; jangan menyatakan P3 final hanya karena endpoint dapat dipanggil.

Status saat dokumen dibuat: branch sudah dibuat, rencana dan traceability ditulis. Source aplikasi, database, runtime, commit/push dan deployment belum diubah oleh pekerjaan ini.

## Referensi teknis

- [NestJS controllers](https://docs.nestjs.com/controllers) dan [TypeORM integration](https://docs.nestjs.com/data/typeorm): class controller, repository injection dan penggabungan modul.
- [NestJS validation](https://docs.nestjs.com/techniques/validation): validasi runtime request, bukan sekadar tipe compile-time.
- [TypeORM entities](https://typeorm.io/docs/entity/entities/) dan [relations](https://typeorm.io/docs/relations/relations/): metadata persistence dan relasi dengan nullability/delete behavior eksplisit.
- [TypeORM transactions](https://typeorm.io/docs/transactions/): seluruh operasi di transaksi harus memakai EntityManager transaksi yang disediakan.
- [TypeORM migrations](https://typeorm.io/docs/migrations/why/): perubahan schema eksplisit; jangan memakai synchronize otomatis terhadap data yang harus dipertahankan.
- Metadata versi diperiksa melalui registry resmi npm untuk @nestjs/core, @nestjs/typeorm, typeorm, typescript. Kompatibilitas proyek masih harus dibuktikan P1.
