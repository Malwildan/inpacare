# Dokumentasi

Mulai dari [README proyek](../README.md), lalu pilih panduan sesuai pekerjaan Anda.

## Pengembangan

- [Penyiapan pengembangan](development/GETTING_STARTED.md) untuk prasyarat, API dan web lokal, serta variabel lingkungan.
- [Runtime Windows](development/RUNTIME_SETUP.md) untuk perangkat PostgreSQL lokal.
- [Pengujian API](development/API_TESTS.md) untuk skenario dengan PostgreSQL sementara.
- [Pengujian peramban](development/BROWSER_TESTS.md) untuk penyiapan dan cakupan Playwright.
- [Komponen antarmuka](development/UI_COMPONENTS.md) untuk sumber shadcn-svelte, penyesuaian lokal, dan pemeriksaan pembaruan.
- [Aturan demo](development/BUILD_CONTRACT.md) untuk keputusan domain dan antarmuka.
- [Arsitektur API](development/ARCHITECTURE.md) dan [arsitektur aplikasi web](development/FRONTEND_ARCHITECTURE.md).
- [Panduan kontribusi](../CONTRIBUTING.md) untuk perubahan, pemeriksaan, dan pull request.
- [Kontrak OpenAPI](../contracts/README.md) untuk spesifikasi dan tipe TypeScript.
- [Penjelajah API](development/API_EXPLORER.md) untuk Swagger UI dan cara menguji dengan akun InpaCare.
- [Inventaris teks InpaCare](development/TEKS_INPACARE.md) untuk cakupan dan pemeriksaan pesan antarmuka.

## Pengoperasian

- [CI dan pembaruan demo otomatis](deployment/CONTINUOUS_DELIVERY.md).
- [Docker Compose](deployment/HOSTING.md) untuk pengoperasian dan cadangan data di kontainer.
- [Linux dengan systemd](deployment/NATIVE_HOSTING.md) untuk runtime lokal dan layanan pengguna.
- [Perangkat basis data bersama](deployment/SHARED_TOOLS.md) untuk pgAdmin dan akun individual.

<a id="reference"></a>

## Referensi

- [Tugas perawatan dan rekam medis](reference/clinical.md).
- [Rekap rawat inap, notifikasi, dan tagihan](reference/cycles-and-billing.md).
- [Ruang rawat inap dan penempatan](reference/rooms-and-placements.md).
- [Status proyek](PROJECT_STATUS.md) untuk cakupan, hasil pemeriksaan terdahulu, dan pekerjaan lanjutan.

## Arsip perencanaan dan desain

- [Rencana implementasi](planning/IMPLEMENTATION_PLAN.md).
- [Kebutuhan dan keputusan](planning/REQUIREMENTS_AND_DECISIONS.md).
- [Rancangan teknis](planning/TECHNICAL_DESIGN.md).
- [Rencana pengiriman dan pengujian](planning/DELIVERY_AND_VALIDATION.md).
- [Bukti desain](planning/sources/figma-final-evidence.md) dan [bukti kebutuhan](planning/sources/requirements-evidence.md).
- [Catatan pembuatan hasil build Rust lintas platform](deployment/LINUX_BUILD.md).

Arsip mencatat sumber dan keputusan pada saat implementasi. Ekspor kebutuhan awal, identitas mahasiswa, konfigurasi host pribadi, dan diagnostik autentikasi disimpan di luar repositori publik. Materi pihak ketiga mengikuti hak cipta dan pengaturan akses sumbernya.
