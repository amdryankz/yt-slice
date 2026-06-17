# 🚀 Clipper Project Roadmap & Backlog

Dokumen ini berisi daftar inisiatif dan fitur potensial untuk meningkatkan skalabilitas, stabilitas, dan User Experience (UX) dari aplikasi Clipper (selain integrasi Publishing Social Media). 

---

## 🏗️ 1. Infrastructure & Storage Refactoring (Persiapan VPS/Production)
*Prioritas tinggi jika ingin di-deploy ke server cloud (VPS).*

- [ ] **Migrasi Local Storage ke Cloud Object Storage (AWS S3 / Cloudflare R2)**
  - **Masalah:** Saat ini aplikasi menyimpan hasil render `.mp4` secara lokal di folder `apps/web/public/clips/`. Ini akan menghabiskan *disk space* VPS dengan cepat.
  - **Solusi:** Worker harus diarahkan untuk mengunggah hasil render akhir langsung ke Bucket S3/R2, dan mengembalikan *Public URL* ke database.
- [ ] **Sistem Auto-Cleanup Job (Cron Job)**
  - **Masalah:** File video utuh dari YouTube dan *temporary files* (`.tmp.mp4`, `.ass`) yang tertinggal bisa menumpuk.
  - **Solusi:** Buat *BullMQ Cron Job* yang otomatis berjalan setiap malam untuk membersihkan file mentah/sampah yang umurnya lebih dari 24 jam.

---

## ✨ 2. Peningkatan User Experience (UX) Frontend
*Fokus pada tampilan, kecepatan, dan interaktivitas bagi pengguna.*

- [ ] **Migrasi Polling ke WebSockets / Server-Sent Events (SSE)**
  - **Masalah:** Saat ini frontend melakukan *polling* setiap 3 detik ke backend untuk mengecek apakah video sudah selesai dirender.
  - **Solusi:** Terapkan koneksi *Server-Sent Events* (SSE) di Next.js agar notifikasi status "Completed" ter-*push* langsung secara instan tanpa membebani *bandwidth* server.
- [ ] **Visual Video Timeline / Range Slider**
  - **Fitur:** Mengubah *Inline Editor* untuk "Start Time" dan "End Time" menjadi komponen *drag-and-drop timeline waveform* interaktif (mirip UI *CapCut*) di halaman *PodcastDetail*.
- [ ] **Global Error Toast & Notifications**
  - **Fitur:** Hapus penggunaan `alert()` bawaan browser dan ganti dengan *Toast Notification Library* modern (seperti `sonner` atau `react-hot-toast`) agar aplikasi terasa lebih premium.

---

## 🤖 3. Peningkatan Kualitas AI & Rendering (Backend)
*Membuat hasil potongan video lebih canggih dan kompetitif.*

- [ ] **Face Tracking Auto-Crop (Smart Center)**
  - **Fitur:** Saat ini kita menggunakan *static crop* (potong tengah). Kita bisa meningkatkan *worker* menggunakan filter FFmpeg pelacakan wajah, sehingga saat video di-*crop* ke vertikal (9:16), kamera selalu fokus mengikuti wajah orang yang sedang berbicara.
- [ ] **Kustomisasi Gaya Subtitle Dinamis**
  - **Fitur:** Berikan opsi dropdown/palet warna di `ClipCard` (Frontend) kepada pengguna untuk memilih *Font Family*, Warna Subtitle, dan Warna Outline secara bebas. Pilihan ini kemudian disuntikkan secara dinamis ke generator file `.ass` di *worker*.
- [ ] **AI-Driven B-Roll & Visual Enhancements**
  - **Fitur:** Meminta *Gemini* menentukan kata kunci (*keywords*) pada momen tertentu, lalu secara otomatis mengunduh video stok singkat (dari *Pexels API*) dan menyisipkannya ke video (B-Roll) untuk mengurangi visual yang monoton.

---

## 🔐 4. Multi-Tenant & User Management (Persiapan SaaS)
*Persiapan dasar untuk menjadikan Clipper sebagai platform publik.*

- [ ] **Autentikasi Pengguna (Login/Register)**
  - **Fitur:** Integrasikan **NextAuth.js** (Auth.js) agar orang harus login dengan akun Google atau Email sebelum bisa memotong podcast.
- [ ] **Sistem Kuota / Credit Allocation**
  - **Fitur:** Tambahkan mekanisme tabel `credits`. Memotong 1 jam podcast menghabiskan sekian kredit, memotong 1 klip menghabiskan 1 kredit. Ini dasar yang kuat sebelum memasang sistem pembayaran.
