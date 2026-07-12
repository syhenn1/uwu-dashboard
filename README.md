# Monitoring Fasilitator Revitalisasi Sekolah

Dashboard Next.js untuk memantau kinerja fasilitator lapangan pada program revitalisasi
sekolah (14 hari siklus pendampingan), dengan data ditarik dari Google Sheet publik dan
analisis kualitatif dibantu LLM (Llama, lewat Hugging Face Inference API).

## Cara jalan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Tanpa konfigurasi apa pun, dashboard
akan langsung memakai data contoh di `fixtures/sample-sheet.csv` (dua fasilitator, 14 hari,
diambil dari data yang diberikan saat perancangan).

`npm run dev` sudah menjalankan semua yang dibutuhkan dalam satu proses - tidak ada server
model terpisah yang perlu dinyalakan, karena analisis AI selalu lewat API cloud Hugging Face
(`lib/llm.ts`), bukan model yang dijalankan di mesin lokal. Tiap kali tombol "Buat Analisis AI"
diklik, log muncul di terminal tempat `npm run dev` jalan - format `[AI ...]` untuk
panggilan ke model (durasi, jumlah karakter, token in/out) dan `[API ...]` untuk request yang
masuk ke route handler-nya.

## Konfigurasi (`.env.local`)

Salin `.env.local.example` menjadi `.env.local` lalu isi:

- `SHEET_CSV_URL` — URL tab **"Level Fasil"** di Google Sheet asli (sheet harus share
  "Anyone with the link" bisa view). Buka tab "Level Fasil"-nya dulu supaya aktif, lalu
  copy URL dari address bar apa adanya (`.../edit?gid=...` juga boleh — otomatis
  dikonversi ke endpoint export CSV oleh `lib/sheet.ts`). Kosongkan untuk tetap memakai
  data contoh.
- `HF_TOKEN` — token API Hugging Face (buat di huggingface.co/settings/tokens). Wajib diisi
  supaya tombol "Buat Analisis AI" / "Buat Ringkasan AI" berfungsi. Model default-nya "gated" -
  buka halaman modelnya di huggingface.co dan terima lisensi Meta dulu sebelum token bisa
  memanggilnya.
- `HF_MODEL` — model yang dipanggil (default `meta-llama/Llama-4-Scout-17B-16E-Instruct`).
  Ini **selalu lewat API cloud HF** (`lib/llm.ts`), bukan dijalankan lokal - Llama 4 Scout itu
  109B parameter, jauh di luar kemampuan GPU biasa (butuh kelas H100 80GB+). Jangan coba muat
  lewat `transformers`/`AutoModelForCausalLM` di mesin lokal.
- `SHEET_CHECKPOINT_GID` — opsional, gid tab "Check Point" kalau beda dari default.
- `NOTIFY_WEBHOOK_URL` / (`RESEND_API_KEY`+`NOTIFY_EMAIL_TO`+`NOTIFY_EMAIL_FROM`) — opsional,
  lihat bagian [Notifikasi otomatis](#notifikasi-otomatis) di bawah.

## Halaman

- **Dashboard** (`/`) — toggle "Semua Waktu" (kondisi terkini + aktivitas kualitatif per
  hari) vs "Per Hari" (browsing tanggal spesifik). Bisa difilter per kampus/koordinator.
  Termasuk tabel perbandingan Hasil LK vs Aplikasi.
- **Fasilitator** (`/fasilitator/[kode]`) — detail 1 fasilitator: tren 14 hari, kepatuhan
  checkpoint per hari ini, anomali, catatan kualitatif, analisis AI.
- **Analisis Massal** (`/analisis-massal`) — generate analisis AI untuk semua kombinasi
  fasilitator×hari sekaligus (progress bar, ekspor JSON/Markdown, tanpa database jadi
  hasilnya perlu diunduh sebelum menutup tab).
- **Anomali** (`/anomali`) — pemindaian lintas 30 fasilitator: belum login LK, data yang
  mendahului hari ini, ketidakcocokan Hasil LK vs Aplikasi, kontradiksi catatan Kendala.
- **Laporan** (`/laporan`) — ringkasan masalah data *sistemik* (kolom yang nilainya seragam
  di semua baris, kolom "Nilai Risiko" kosong, dst.) siap disalin/diunduh untuk dikirim ke
  tim data/Aplikasi Revit. Beda dari halaman Anomali yang fokus per-fasilitator.

## Notifikasi otomatis

`/api/notify-check` memindai anomali & checkpoint yang belum sesuai, membandingkan dengan
temuan terakhir yang tersimpan di `.data/notify-state.json` (state lokal berbasis file —
satu-satunya pengecualian dari keputusan "tanpa database", lingkupnya cuma untuk tahu "apa
yang sudah pernah diberitahukan"), dan mengirim **hanya yang baru** ke channel yang
dikonfigurasi (`NOTIFY_WEBHOOK_URL` untuk Slack/Discord/dst, atau Resend untuk email).
Pengecekan pertama cuma menyimpan baseline, tidak mengirim apa-apa.

Bisa dipicu manual lewat tombol "Cek Sekarang" di halaman `/laporan`, atau dijadwalkan dari
luar aplikasi (aplikasi ini sendiri tidak punya cron internal):

- **Windows Task Scheduler** (server jalan lokal terus): buat task yang menjalankan
  `curl http://localhost:3000/api/notify-check` tiap beberapa jam.
- **Vercel Cron** (kalau di-deploy ke Vercel): tambahkan `vercel.json` dengan `crons` yang
  memanggil endpoint ini — tapi perhatikan filesystem Vercel tidak persisten antar
  invocation, jadi `.data/notify-state.json` tidak akan tersimpan; state notifikasi butuh
  disesuaikan ke penyimpanan eksternal (mis. Vercel KV) kalau dipakai di sana.

## Struktur

- `lib/sheet.ts` — fetch & parse CSV (publik atau fixture), jadwal "Check Point" & hitung
  hari ini itu "Hari ke-" berapa (jangkar tetap 6 Juli 2026 = Hari 1, dengan fallback kalau
  sheet tidak bisa diakses).
- `lib/columns.ts` — mapping header spreadsheet ↔ field terstruktur, parser nilai (persen,
  `#DIV/0!`, "Sudah/Belum", teks bebas).
- `lib/knowledge/checkpoints.ts` — basis pengetahuan checkpoint: definisi tiap kolom, bobot
  risiko, dan hari mulai berlaku (dari tab "Kolom LK"). Dipakai untuk tooltip, prompt LLM,
  estimasi Nilai Risiko, dan cek kepatuhan.
- `lib/metrics.ts` — agregasi (ringkasan harian, level risiko, estimasi Nilai Risiko).
- `lib/compliance.ts` — cek tiap checkpoint terpenuhi atau tidak untuk kondisi terkini,
  dengan pengecekan silang (bukan cuma percaya 0% mentah - lihat komentar di file).
- `lib/anomalies.ts` — 4 jenis deteksi anomali per fasilitator + perbandingan LK vs Aplikasi.
- `lib/systemicReport.ts` — deteksi masalah data level program (kolom bernilai seragam, dst).
- `lib/notes.ts` — pengelompokan catatan kualitatif per rentang hari + aktivitas per hari.
- `lib/prompts.ts` + `lib/llm.ts` — membangun prompt & memanggil model lewat HF router.

Data & analisis AI diambil **on-demand** (tanpa database) — analisis AI baru dipanggil saat
tombol diklik, hasilnya hanya tersimpan di state browser selama sesi berjalan (kecuali lewat
Analisis Massal, yang punya tombol unduh). Satu-satunya state yang disimpan ke disk adalah
`.data/notify-state.json` untuk notifikasi (lihat di atas).
