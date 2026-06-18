# 🚀 Clipper Project Roadmap v2.0

*Sebagian besar infrastruktur dasar aplikasi (Cloud Storage S3, Auto-Cleanup Cron, Real-time SSE, Global Toasts) telah berhasil diselesaikan. Roadmap ini kini difokuskan pada tahap lanjutan untuk mengubah Clipper menjadi platform pembuat klip AI kelas dunia (SaaS).*

---

## 🤖 1. AI Video & Audio Intelligence (Keunggulan Kompetitif)

- [ ] **Smart Face-Tracking Cropping (AI)**
  - **Ide:** Saat mengubah video YouTube horizontal (16:9) menjadi vertikal (9:16) untuk TikTok, terkadang wajah pembicara keluar dari bingkai.
  - **Solusi:** Gunakan filter `facedetect` bawaan FFmpeg (atau integrasi OpenCV ringan) agar *crop* video secara otomatis bergeser mengikuti letak wajah pembicara utama.

- [ ] **Word-by-Word Karaoke Subtitles**
  - **Ide:** Subtitle saat ini muncul per kalimat. Gaya TikTok modern menyorot kata secara individual (berubah warna) persis saat kata tersebut diucapkan.
  - **Solusi:** Manfaatkan data `words` dari Deepgram, lalu buat skrip *Advanced SubStation Alpha (.ass)* yang menggunakan tag karaoke (`{\k}`) agar subtitle menyala kata-demi-kata.

- [ ] **Auto-Remove Silence & Stutters ("Umm/Ehh")**
  - **Ide:** Menghilangkan jeda kosong yang terlalu lama atau kata-kata pengisi yang tidak perlu agar klip terasa lebih padat dan retensi penonton meningkat.
  - **Solusi:** Gunakan AI transkripsi untuk mendeteksi *filler words* dan filter audio FFmpeg (`silenceremove`) untuk membuang keheningan.

---

## 🎨 2. Personalisasi & Branding Studio

- [ ] **Brand Kit & Custom Templates**
  - **Ide:** Pengguna (atau Anda) ingin warna subtitle, posisi watermark, dan jenis font yang berbeda-beda untuk setiap klip.
  - **Solusi:** Buat halaman UI "Brand Kit" untuk menyimpan preferensi warna hex, ukuran font, dan letak posisi, lalu lewatkan variabel tersebut ke *worker* FFmpeg.

- [ ] **Auto B-Roll & Visual Hooks**
  - **Ide:** Menambahkan gambar atau klip video stok di 3 detik pertama (Hook) untuk mencegah penonton men-*scroll* layar.
  - **Solusi:** Minta Gemini AI untuk mendeteksi "kata kunci visual" pada awal kalimat, lalu aplikasikan *overlay* gambar sederhana melalui FFmpeg.

---

## 🌍 3. Distribusi Otomatis & SaaS (Fase Produksi Final)

- [ ] **Social Media Direct Publisher**
  - **Ide:** Daripada harus mengunduh lalu mengunggah klip secara manual, publikasikan langsung dari *dashboard*.
  - **Solusi:** Gunakan NextAuth.js untuk *login* dengan TikTok/Google/Meta, simpan token akses, dan gunakan API resmi TikTok/YouTube untuk *auto-upload* klip yang sudah selesai di-render.

- [ ] **User Authentication & Monetization (Stripe)**
  - **Ide:** Membatasi akses publik agar server VPS Anda tidak kehabisan *resource* oleh orang asing, atau mulai memungut biaya (Langganan SaaS).
  - **Solusi:** Integrasi Clerk / NextAuth untuk *login* pengguna, dan Drizzle ORM untuk mencatat "Kredit Pemotongan" (misal: 1 akun gratis 3 klip/hari).

---

## ⚡ 4. Optimalisasi Server VPS (Performance)

- [ ] **GPU-Accelerated Rendering (NVENC/CUDA)**
  - **Ide:** Jika di masa depan Anda menyewa VPS yang memiliki kartu grafis (GPU), proses FFmpeg bisa dipercepat hingga 10x lipat.
  - **Solusi:** Instal *driver* NVIDIA di VPS dan ganti *encoder* FFmpeg di dalam *worker* dari `libx264` (CPU) menjadi `h264_nvenc` (GPU).
