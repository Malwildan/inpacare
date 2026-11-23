# Arsitektur aplikasi web

InpaCare memakai Clean Architecture yang dikelompokkan menurut fitur di `apps/web/src/lib`. Rute SvelteKit menyesuaikan masukan dari kerangka kerja. Operasi berada di modul fitur masing-masing. API aktif menggunakan NestJS. Dokumen desain Rust mencatat riwayat.

## Tanggung jawab dan dependensi

| Lokasi | Tanggung jawab | Dependensi yang diizinkan |
| --- | --- | --- |
| `features/<name>/domain` | Model dan aturan yang bebas dari kerangka kerja | Domain sendiri dan kode bersama murni |
| `features/<name>/application` | Kontrak operasi, query, dan alur kasus penggunaan | Domain dan aplikasi sendiri, tipe publik fitur, kode bersama murni |
| `features/<name>/infrastructure` | Rute HTTP, DTO, dan serialisasi | Aplikasi dan domain sendiri, transport HTTP bersama, tipe hasil OpenAPI |
| `features/<name>/presentation` | Halaman Svelte, formulir, keadaan sementara, navigasi, dan pemuatan ulang | Antarmuka publik sendiri, komponen dan pemformat bersama |
| `app/composition` | Pembuatan adaptor per permintaan atau halaman dan integrasi antarfitur | Kontrak fitur, kasus penggunaan, dan adaptor |
| `app/shell` | Navigasi, kerangka halaman, dan tampilan kesalahan | Antarmuka publik fitur dan kode bersama |
| `shared` | Transport, kesalahan, pemformat, dan komponen umum | Kode bersama |

Fitur mencakup auth, reference-data, notifications, tasks, rooms, placements, patients, medical-records, care-cycles, dan billing. Layar rekap berada di care-cycles, kalender di placements, dan tagihan di billing. `index.ts` menyediakan operasi dan model publik. Rute mengimpor tampilan dan komposisi membuat adaptor infrastruktur.

Pemeriksa dependensi mengikuti impor relatif dan alias `$lib`. Pemeriksa membaca skrip TypeScript dan Svelte, mendeteksi impor privat, pemanggilan fetch langsung, pelanggaran lapisan, dan siklus impor. Server memeriksa akses saat aplikasi berjalan.

## Alur data dan keadaan aplikasi

1. Pemuatan di server membaca URL dan parameter, membuat operasi dengan `event.fetch` per permintaan, lalu mengembalikan data yang dapat diserialkan. Rute menangani pengalihan dan kesalahan halaman.
2. Komponen rute membuat operasi untuk instans peramban dan memberikan operasi serta data ke tampilan. Layanan tetap berada di lingkup permintaan atau komponen.
3. Tampilan membaca kolom formulir dan memanggil operasi. Adaptor menentukan rute dan serialisasi. Transport mengirim kredensial origin sama dan membaca kuki CSRF saat mengirim.
4. Transport mempertahankan status dan kode API. Pesan hanya diteruskan jika cocok dengan daftar teks yang dikurasi. Lapisan tampilan memberi petunjuk sesuai tindakan saat respons kosong, tidak dikenal, atau koneksi terputus. Tampilan juga mengarahkan petugas untuk masuk kembali jika sesi berakhir. Pertahankan draf saat pengiriman gagal dan bedakan hasil simpan yang sudah dikonfirmasi dari kegagalan pemuatan ulang.

Proksi `/api/v1` menjaga origin API privat di server, meneruskan kuki, dan memakai `no-store`. API memeriksa peran, cakupan data, versi, transaksi, dan total.

Model domain berdiri sendiri. Adaptor memakai `generated/api.d.ts` untuk respons dan memeriksa kompatibilitas masukan. Daftar, detail, dan hasil perubahan memiliki tipe masing-masing. Kirim `version` sebagai `expectedVersion`. Nominal tetap berupa teks desimal. API menghitung total tagihan dan inventaris yang disimpan. Tanggal kalender memakai format tanggal saja, sedangkan waktu tugas memakai ISO dengan zona waktu. Nilai awal kalender mengikuti Asia/Jakarta.

Data halaman medis dibedakan dengan `admisiProjection`. Tampilan Admisi memakai identitas dan kolom administratif sesuai OpenAPI. Adaptor tagihan menggunakan `EditLineWire` untuk kasus lama `kind: null` saat mengosongkan jenis layanan, meskipun OpenAPI mendeskripsikan kolom teks opsional.

## Menambah atau mengubah fitur

Gunakan komponen shadcn-svelte di `shared/ui`. Tema dan tipografi bersama berada di `app.css`. [Panduan komponen antarmuka](UI_COMPONENTS.md)

Mulai dari operasi publik dan jenis masukan atau keluaran di application serta aturan murni di domain. Terapkan kontrak di infrastructure, hubungkan di `app/composition`, lalu gunakan pada tampilan. Tambahkan direktori lapisan jika ada tanggung jawab yang diperlukan.

Papan tugas memanggil `tasks.update(id, { expectedVersion, notes })`. Adaptor HTTP menentukan PATCH. Uji `createTasksUseCases(repository).loadPage(filters, page)` dengan repositori sintetis. Atur hubungan antarfitur seperti notifikasi dan pencarian ruang tagihan di komposisi.

Setelah kontrak API berubah, jalankan `npm run types:api`. Perbarui model dan adaptor terkait. Uji label, aksesibilitas, navigasi, parameter pencarian, dan pesan pemulihan.

## Pemeriksaan dan riwayat migrasi

```sh
npm run check --workspace apps/web
npm run check:web:architecture
npm run test:web
npm run build --workspace apps/web
npm run test:e2e -- --workers=1
```

`node scripts/check-web-architecture.mjs --feature tasks` memeriksa fitur tugas bersama app dan shared. Perintah tanpa opsi memeriksa seluruh web. Vitest memeriksa adaptor dan aturan murni. Uji Node memeriksa pemeriksa dependensi. Playwright menggunakan aplikasi dan basis data sintetis terpisah, termasuk simulasi 409 untuk menguji draf.

CI memeriksa tipe, arsitektur, uji unit, build, kecocokan tipe hasil generasi, dan alur peramban pada PostgreSQL sementara.

Baseline source: commit `f6463539d1fbf4bf9d17061e92e78cc22a2cdccd`. OpenAPI SHA-256: `c8ce146488d3ed27b0d1ea7a3bf7905fd717cd5aa9eb5c84444a50b31fb31dca`. The local backend was independently being refactored, so local browser validation uses an isolated compiled API snapshot rather than rebuilding/changing that work. CI validates against its own checked-out backend source.

Preserved routes include login, dashboard, rooms, calendar, tasks, patient context, medical list/detail and invoices. Tasks retain search/status/priority/roomId/patientId/picId/from/to filters. The Kanban board loads each status list independently; legacy task links carrying `page` remain accepted but start at the initial batch in each list, preserving all other filters (issue #23). Dashboard retains search/status/roomId/patientId; calendar retains from. Nurse/coordinator/doctor/admission access and the restricted admission medical projection follow current behavior.


Local validation on 2026-11-03 passed frontend typechecking (zero errors/warnings), production builds, all 29 Vitest cases, 9 dependency-checker cases, 11 existing CI-selection/hook cases, all 17 Playwright cases, generated-type comparison against the unchanged OpenAPI, and CSS/static-copy preservation for all 11 moved views. The isolated API snapshot main.js SHA-256 was `743acfcef01b9a4d9a5a76ddc201d0a39f3708a64ad77abcfbc6aaa36d8fa8c9`. These are local results; the new GitHub Actions job has not been run remotely by this task. Full pixel parity is not asserted by the CSS/copy comparison.
