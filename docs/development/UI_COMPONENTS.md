# Komponen antarmuka

InpaCare memakai komponen shadcn-svelte yang dapat disunting di `apps/web/src/lib/shared/ui/<component>/`. Bits UI menangani interaksi. Tailwind menyediakan tema dan gaya utilitas.

## Tanggung jawab

| Lokasi | Tanggung jawab |
| --- | --- |
| `apps/web/components.json` | Registri dan alias ke `shared`, dengan Tailwind CSS di `src/app.css` |
| `apps/web/src/app.css` | Warna, DM Sans, token semantik, aksesibilitas, dan tipografi |
| `shared/ui/<component>/` | Sumber komponen registri dan variannya |
| `shared/ui/form-select.svelte` | Pilihan dan filter dengan nilai teks atau null, validasi wajib, FormData, dan callback |
| `shared/ui/calendar`, `shared/ui/form-date-picker.svelte` | Kalender dan Popover untuk tanggal, waktu, filter, dan FormData |
| `shared/ui/dialog-frame.svelte` | Dialog fitur, perlindungan draf, dan pengembalian fokus |
| `shared/ui/status-badge.svelte` | Label status berbahasa Indonesia dan warna semantik |
| `shared/ui/sonner` | Wadah pesan sementara dan API svelte-sonner |
| `app/shell` | Navigasi sesuai peran, Sheet seluler, jejak navigasi, dan Popover notifikasi |
| `features/*/presentation` | Isi fitur, formulir, tabel, papan, kalender, dan keadaan sementara |

Impor komponen dari `index.js` masing-masing, misalnya `$lib/shared/ui/button/index.js`. Rangkai komponen di fitur yang memerlukan. Simpan kode domain dan fitur di luar komponen bersama.

## Penyesuaian lokal

- Gunakan `muted-foreground` untuk teks sekunder dan `muted` untuk latar. Badge menyertakan teks status agar warna bukan satu-satunya pembeda.
- Button memakai `type="button"` secara bawaan. Tetapkan `type="submit"` pada tombol pengiriman. Gunakan label berbahasa Indonesia pada kontrol, termasuk tombol ikon. Tandai ikon dekoratif dengan `aria-hidden="true"`. Tombol standar memiliki tinggi 44 piksel. Kontrol ikon ringkas memakai ukuran masing-masing.
- Gunakan varian `outline` atau `ghost` untuk **Batal**, **Tutup**, dan **Kembali**. Gunakan `destructive` (merah lembut) untuk membuka konfirmasi atau membuang draf, serta `destructive-confirm` (merah solid) untuk konfirmasi perubahan yang sulit dibatalkan.
- `FormSelect` menggunakan Select untuk kolom dan filter. Pemicu dan daftar berbagi tema, navigasi papan ketik, penempatan portal, dan pengembalian fokus. Pertahankan nilai filter kosong dan nilai fasilitas null. Kolom hasil klaim memakai Input dan saran Dropdown Menu yang tetap mengizinkan teks bebas.
- `FormDatePicker` memakai Calendar dan Popover. Untuk tanggal dan jam, masukan jam berada di Popover. Pertahankan tanggal `YYYY-MM-DD` dan waktu lokal hingga diserialkan oleh pemanggil. Filter opsional dapat dikosongkan. Kolom wajib memakai validasi formulir dan pesan yang terlihat.
- Kartu tugas menggunakan satu tombol sepanjang kartu untuk membuka detail. Pengguna dapat mengeklik, mengetuk, atau menekan Enter dan Spasi. Aksi **Pindahkan** berada di detail. Saat simpan berlangsung, kartu tetap bisa dibaca dan perpindahan lain diblokir hingga respons diterima.
- Kartu yang boleh dipindah memakai gambar seret bawaan. Gambar dibersihkan saat dilepas, dibatalkan, navigasi, atau komponen ditutup. Gerak terbatas menonaktifkan skala, kemiringan, dan animasi. Hamparan kolom tujuan memakai `--primary` dan memberi sorotan di bawah penunjuk. Kolom terkunci memberi alasan dan memakai `--muted-foreground`. Kolom asal menampilkan **Batal pindah** dengan `--muted-foreground`. Melepas di kolom asal mempertahankan urutan dan versi. Melepas di kolom tujuan menaruh tugas di akhir daftar. Dialog tetap menyediakan pengaturan posisi dan alasan pembatalan.
- Gunakan `.action-buttons` untuk tombol berjajar dengan lebar seragam atau bertumpuk di layar sempit. Gunakan `.action-buttons--table` untuk kolom tindakan dan `.action-buttons--full` untuk kelompok selebar wadah. `.form-actions`, `.card-actions`, DialogFooter, dan AlertDialogFooter mengizinkan label panjang membungkus. Tabel dan jadwal ruang bergulir di dalam wadah.
- Pertahankan draf dan fokus pada kegagalan. Dialog sibuk mencegah pengiriman ganda dan biasanya menahan penutupan. Dialog pindah tugas dapat ditutup saat permintaan berjalan. Papan tetap menandai kartu sebagai sedang diproses. Menutup dialog pindah yang belum mengirim mengembalikan pengguna ke detail.
- Gunakan `toast` dari `$lib/shared/ui/sonner/index.js` untuk status singkat. Satu Toaster di tata letak utama menjaga pesan tetap terlihat saat navigasi. Perbarui toast pemrosesan memakai ID yang sama. Saat daftar gagal dimuat, tampilkan pesan dan tindakan muat ulang pada tempatnya. Pesan panjang harus terbaca pada layar sempit dan diumumkan kepada pembaca layar. Tombol tutup toast memiliki target 44 piksel dan tidak menutup dialog aktif.
- Formulir pembuatan dan koreksi memakai `dialog-frame.svelte`. Atur `protectChanges` jika menutup dialog dapat menghilangkan draf. Gunakan callback `close` untuk **Batal**, sama seperti Escape, kembali, dan tombol tutup. Pertanyaan untuk membuang draf berada dalam dialog yang sama.
- Detail tagihan, ruang, tugas, dan rekap memakai satu dialog yang berganti isi. Gunakan `formKey` untuk menetapkan awal draf, posisi gulir, dan fokus. Gunakan `backLabel` untuk kembali ke detail. Muat hasil dari server setelah perubahan dikonfirmasi. Jika pemuatan ulang gagal, sebutkan bahwa perubahan telah tersimpan.
- Dialog fitur memenuhi layar di bawah 640 piksel. Isi bergulir dengan tombol formulir tetap berada pada bagian bawah. Gunakan `wide` pada formulir tagihan dan rekam medis. Letakkan tombol di luar kolom formulir.
- Notifikasi memakai `features/notifications/presentation/NotificationDialog.svelte` untuk daftar lengkap dan Popover pada bilah navigasi. Muat daftar saat dibuka, tampilkan tindakan percobaan ulang pada kegagalan, dan tandai sudah dibaca melalui layanan notifikasi.
- Perbandingan riwayat tugas berada dalam tampilan baca di dialog yang sama. Tombol kembali membuka kejadian riwayat yang dipilih. Filter lanjutan pada rekap dan papan tugas punya tindakan terapkan dan batal. **Batal** mempertahankan filter yang sudah diterapkan.
- Pertahankan nominal desimal, `expectedVersion`, izin, serta serialisasi tanggal dan waktu. API memeriksa perubahan dan menghitung nilai yang disimpan.
- Gunakan judul HTML atau `role="heading"` dengan `aria-level` saat CardTitle menamai bagian. Overlay registri memakai portal. Terapkan gaya ke elemen yang dirender pada portal.

## Tinjau pembaruan registri

1. Mulai dari cabang bersih dan periksa komponen, pemanggil, dan perubahan lokal.
2. Bandingkan dengan [registri shadcn-svelte](https://www.shadcn-svelte.com/docs). Ambil pembaruan di salinan sementara sebelum menerapkannya.
3. Tinjau perubahan sumber, dependensi, dan lockfile bersama. Simpan perilaku fitur di komponennya.
4. Jalankan `npm run check --workspace apps/web`, `npm run check:web:architecture`, `npm run test:web`, dan build web produksi. Untuk komponen, gunakan `npm run test:web:ux`.
5. Jalankan [alur peramban sintetis](BROWSER_TESTS.md) untuk fitur yang berubah. Periksa lebar 390 piksel, tablet, desktop, gerak terbatas, dialog bertingkat, dan hidrasi.

Swagger UI di `/api-docs` memakai gaya sendiri. Pertahankan kontrol penjelajah saat tema aplikasi berubah.
