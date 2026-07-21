# Laporan Riwayat Migrasi Sistem Sinkronisasi Lapis AI (Apps Script ke Next.js)

## 1. Latar Belakang Masalah
Sistem sebelumnya menggunakan Google Apps Script (`logPuller.gs`) untuk menarik data metrik dari 390 *spreadsheet* (Buku Kerja / LK) Fasilitator secara harian.
**Masalah Utama:** Apps Script memiliki batas waktu eksekusi maksimal (sekitar 5-6 menit) dan pembatasan kuota *UrlFetchApp*. Hal ini menyebabkan *script* sering mengalami *Time Out* sebelum selesai memproses 390 *file*, sehingga pembaruan data di Sheet `masterLog` menjadi lambat, tidak lengkap, atau terpotong di tengah jalan.

## 2. Strategi Migrasi yang Diimplementasikan
Untuk mengatasi masalah waktu dan performa, kami memindahkan beban kerja komputasi (penarikan 390 data) dari Apps Script ke Next.js:
1. **Next.js Cron API (`/api/cron/sync-logs`)**: Bertugas melakukan *fetch* secara simultan ke 390 LK Fasilitator menggunakan protokol `gviz/tq?tqx=out:csv` (Google Visualization API), mem-*parsing* CSV-nya, dan mengumpulkan 390 baris hasil akhir.
2. **Apps Script Webhook (`syncReceiver.gs`)**: Bertindak murni sebagai "Penerima" (Receiver). Next.js akan mengirim 390 baris data yang sudah matang dalam bentuk JSON ke Webhook ini, dan Webhook langsung menyuntikkannya ke `masterLog` hanya dalam hitungan milidetik menggunakan `.setValues()`.

## 3. Jejak Kendala (Trial & Error) yang Telah Diatasi
Selama proses integrasi, kami menghadapi dan mengatasi beberapa tantangan teknis:
* **Tantangan 1 (Terblokir Middleware):** Rute Cron Job awalnya terblokir dan dialihkan (*redirect*) ke halaman Login (berwujud HTML/DOOM) karena sistem keamanan Next.js. **Solusi:** Rute `/api/cron` dimasukkan ke *whitelist* `PUBLIC_PATHS` di `proxy.ts`.
* **Tantangan 2 (Baris Hantu / Duplikasi):** Saat hanya mengirimkan data fasilitator yang berhasil (misal 281 baris), blok `masterLog` yang berkapasitas 390 baris tidak tertimpa sepenuhnya, menyisakan "baris hantu" sisa hari sebelumnya. **Solusi:** Mewajibkan Next.js mengirim persis 390 baris array yang dikunci posisinya sesuai Roster, menggunakan string kosong untuk fasilitator yang belum mengisi.
* **Tantangan 3 (ECONNRESET & Next.js Undici Crash):** Meminta Next.js menarik 390 *link* Google secara bersamaan 100% memicu pemutusan paksa jaringan oleh Windows/Google (*ECONNRESET*). **Solusi:** Membangun algoritma *Sliding Window Concurrency* dengan batas maksimal 15 pekerja paralel. Waktu eksekusi kini sangat stabil di ~127 detik.
* **Tantangan 4 (Turbopack Memory Panic):** Mode pengembangan (`npm run dev` / Turbopack) kehabisan memori dan *crash* saat memantau 390 *request* asinkron. **Solusi:** Beralih menggunakan *Production Build* (`npm run build && npm start`), yang berjalan ringan dan tanpa *error*.

## 4. Hambatan Kritis Saat Ini (Unresolved Issue)
Meski sinkronisasi *backend* sudah berjalan sempurna dan **pengguna mengonfirmasi bahwa nilai di Google Sheet `masterLog` sudah benar (94.6)** untuk "A'la Dwi Annisa", antarmuka UI *Dashboard* Next.js **tetap menampilkan angka 185.50**. 

**Upaya yang telah dilakukan namun gagal:**
1. Menghentikan total proses Node.js untuk membersihkan variabel *Cache RAM* (TTL 5 Menit).
2. Menghapus paksa direktori `.next/cache/fetch-cache` untuk menghancurkan *Persistent Data Cache* Next.js.
3. Menyalakan ulang *Production Server*.

**Hipotesis Analisis:**
Karena angka `185.50` persis merupakan penjumlahan dari dua Log (misalnya `90.9` + `94.6`), masalahnya **bukanlah pada sistem Cache**, melainkan pada cacat logika di fungsi pemroses data hulu *Dashboard* (seperti `lib/sheet.ts` atau `lib/masterSheet.ts`). Ada kemungkinan *parser* atau pengelompokan Fasil (`rowsByFasilAndDay`) secara tidak sengaja mengakumulasikan nilai lama dan baru, alih-alih me-*replace* nilainya dengan Log tertinggi.

---

## 5. Prompt untuk Claude Opus

Silakan salin teks di bawah ini dan berikan kepada Claude Opus untuk membedah strategi selanjutnya:

```text
Halo Claude! Saat ini saya sedang memigrasikan sistem sinkronisasi data 390 Fasilitator dari Google Apps Script murni ke dalam Next.js (Push System via Webhook). 
Proses tarik data (Cron Job) sudah berjalan dengan sukses. Di dalam Google Sheets 'masterLog' saya, data Skor Akhir untuk fasilitator bernama "A'la Dwi Annisa" sudah tertulis dengan benar, yaitu "94.6".

Namun, ada satu masalah aneh: UI Dashboard Next.js saya malah menampilkan Skor Akhir sebesar "185.50" untuknya. 
Nilai 185.50 ini dicurigai adalah hasil penjumlahan dari skor sebelumnya (90.9) dan skor saat ini (94.6) -> 90.9 + 94.6 = 185.50. 
Padahal, saya sudah menghapus seluruh memori RAM Node.js dan membersihkan folder `.next/cache/fetch-cache` sepenuhnya. Server Production juga sudah di-restart.

Berdasarkan arsitektur data saya:
1. `lib/masterSheet.ts` mengambil CSV dari masterLog, lalu mengubahnya menjadi object via `buildFacilRowFromMasterLog`.
2. Di dalam fungsi itu, nilai mentah persen diproses dengan:
   const frac = raw != null && raw !== "" ? parseFloat(raw) : NaN;
   rawRecord[col.header] = Number.isNaN(frac) ? "" : String(frac * 100);
3. `lib/sheet.ts` lalu mengelompokkannya (grouping) per fasilitator & hari dengan `Map<string, ParsedMasterLogRow>`:
   const key = `${row.namaFasil}-${row.hari}`;
   const prev = rowsByFasilAndDay.get(key);
   if (!prev || row.logNumber >= prev.logNumber) {
       rowsByFasilAndDay.set(key, row);
   }

Bisakah kamu bertindak sebagai Senior Next.js & TypeScript Engineer? 
Tolong identifikasi celah logika (logical flaw) mana di dalam proses parsing atau mapping Next.js saya (baik di `masterSheet.ts`, `sheet.ts`, atau pemrosesan Papa Parse CSV) yang bisa menyebabkan angka 94.6 dan 90.9 terjumlah/tertumpuk menjadi 185.50 di UI? 
Berikan hipotesis terkuatmu dan strategi teknis untuk menelusuri serta menambal celah tersebut.
```
