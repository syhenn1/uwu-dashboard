import type { CheckpointSourceData, FacilRow } from "../types";

export interface CheckpointIndicator {
  kolom: keyof FacilRow;
  definisi: string;
  sumberData: CheckpointSourceData;
  bobot: number;
  /** "higherIsWorse" (default) untuk kolom "% masalah" - semakin tinggi semakin
   * berisiko. "higherIsBetter" untuk kolom seperti "% Sekolah dengan Dok. ...
   * Terunggah 100% (Lengkap)" yang mengukur kelengkapan - semakin tinggi semakin
   * baik, jadi kontribusi risikonya dibalik (100 - nilai) saat dihitung. */
  polarity?: "higherIsWorse" | "higherIsBetter";
}

export interface CheckpointGroup {
  no: number;
  name: string;
  /** "Hari ke-" mulai checkpoint ini relevan/berlaku (gating progresif siklus 14 hari). */
  activeFromDay: number;
  bobotTotal: number;
  tujuan: string;
  indicators: CheckpointIndicator[];
}

/** Panjang siklus pendampingan penuh - dipakai sebagai `hari` "tak terbatas"
 * supaya activeCheckpoints() mengembalikan SEMUA checkpoint (mis. untuk
 * tampilan "Keseluruhan" yang sengaja tidak digating per hari tertentu). */
export const TOTAL_HARI_SIKLUS = 14;

/**
 * v2: basis pengetahuan checkpoint dibangun dari tabel bobot "Skor Akhir" baru
 * (26 indikator, total bobot 154 - lihat pesan program owner tanggal
 * 2026-07-16) - BUKAN "Nilai Risiko" 100-poin milik v1 lagi. Sengaja
 * dipetakan ke `kolom` FacilRow yang SAMA dengan v1 (mis.
 * "% Sekolah Sudah Dihubungi/Terhubung" -> `pctSekolahBelumDihubungi`,
 * DIBALIK 100-x saat parsing di lib/sheet.ts) supaya packages/core/prompts.ts
 * dan seluruh pipeline lain (yang ditulis dalam framing "% masalah, makin
 * tinggi makin buruk") TIDAK PERLU diubah sama sekali - itulah cara utama
 * menjamin output LLM v2 tetap SAMA PERSIS dengan v1. Kolom yang framing
 * v1-nya SUDAH positif (kelengkapan dokumen, "higherIsBetter") dipetakan
 * LANGSUNG tanpa dibalik - lihat kolom `invert` di
 * uwu-project-v2/lib/skorAkhirColumns.ts untuk daftar persis mana yang
 * dibalik/tidak.
 *
 * ASUMSI yang belum dikonfirmasi program owner (koreksi kalau salah):
 * - `activeFromDay` tiap checkpoint di-reuse APA ADANYA dari v1 (checkpoint
 *   dengan tema yang sama diasumsikan mulai berlaku di hari yang sama) -
 *   belum ada info baru soal ini untuk skema "Skor Akhir".
 * - `sumberData` (LK Fasil vs Aplikasi Revit) di-reuse dari v1 per indikator
 *   yang temanya sama - dipakai supaya toggle "Kecualikan Data Aplikasi" di
 *   prompt LLM (packages/core/prompts.ts, TIDAK diubah) tetap akurat.
 * - Checkpoint "Dapodik" berubah definisi dari v1 (dulu "F.1 Kesesuaian
 *   Dapodik dengan Lapangan = Belum & F.3 Belum Update", sekarang "Sudah
 *   Upload Bukti Update Dapodik" - kolom itu ADA di tabel baru, gating-nya
 *   dulu bobot 0/info-only, di v2 sekarang bobot 4/gating).
 * - "Fasil Belum Login LK" (dulu bagian checkpoint 1, bobot 3) tidak ada di
 *   tabel 26-kolom baru - dipertahankan sebagai indikator info-only (bobot 0)
 *   di checkpoint 1 karena masih dipakai logic lain (deteksi anomali
 *   never_logged_in, trustLkOkValue di compliance.ts), bukan lagi komponen
 *   Skor Akhir.
 */
export const CHECKPOINT_GROUPS: CheckpointGroup[] = [
  {
    no: 1,
    name: "Sudah dihubungi",
    activeFromDay: 2,
    bobotTotal: 2,
    tujuan: "Mengidentifikasi fasil yang sama sekali belum mulai mengisi LK atau belum menghubungi sekolah, dan menganalisis potensi penyebab tidak tercapainya target checkpoint setelahnya.",
    indicators: [
      { kolom: "pctSekolahBelumDihubungi", definisi: "% Sekolah Sudah Dihubungi/Terhubung (dibalik dari sheet).", sumberData: "LK Fasil", bobot: 2 },
      { kolom: "fasilBelumLoginLK", definisi: "Tidak ada baris data sama sekali untuk fasilitator ini di Hari ke- tsb. Info only (tidak masuk Skor Akhir resmi).", sumberData: "LK Fasil", bobot: 0 },
    ],
  },
  {
    no: 2,
    name: "Sudah login",
    activeFromDay: 2,
    bobotTotal: 2,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target terkait biodata, upload bukti update dapodik, dan unggah dokumen.",
    indicators: [
      { kolom: "pctSekolahBelumLoginAplikasi", definisi: "% Sekolah Sudah Login Aplikasi (dibalik dari sheet).", sumberData: "Aplikasi Revit", bobot: 2 },
    ],
  },
  {
    no: 3,
    name: "Panlak ada",
    activeFromDay: 2,
    bobotTotal: 2,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah.",
    indicators: [
      { kolom: "pctTidakPunyaPanlak", definisi: "% Sekolah Sudah Memiliki Panlak (dibalik dari sheet).", sumberData: "LK Fasil", bobot: 2 },
    ],
  },
  {
    no: 4,
    name: "Format/template ada",
    activeFromDay: 2,
    bobotTotal: 2,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah.",
    indicators: [
      { kolom: "pctTidakPunyaFormatTemplate", definisi: "% Sekolah Sudah Memiliki Format/Template (dibalik dari sheet).", sumberData: "LK Fasil", bobot: 2 },
    ],
  },
  {
    no: 5,
    name: "Biodata terverifikasi",
    activeFromDay: 3,
    bobotTotal: 3,
    tujuan: "Mengidentifikasi sekolah yang biodatanya belum siap untuk PKS.",
    indicators: [
      { kolom: "pctBiodataBelumTerverifikasi", definisi: "% Sekolah Biodata Sudah Terverifikasi Sesuai (dibalik dari sheet).", sumberData: "Aplikasi Revit", bobot: 3 },
    ],
  },
  {
    no: 6,
    name: "Dapodik sesuai kebutuhan",
    activeFromDay: 4,
    bobotTotal: 4,
    tujuan: "Mengidentifikasi sekolah belum siap menyusun RAB usulan, dan menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah teknis.",
    indicators: [
      { kolom: "pctSudahUploadBuktiUpdateDapodik", definisi: "% Sekolah Sudah Upload Bukti Update Dapodik (langsung, sudah positif di v1 juga - tidak dibalik).", sumberData: "LK Fasil", bobot: 4, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 7,
    name: "Perencana ada",
    activeFromDay: 4,
    bobotTotal: 4,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah teknis.",
    indicators: [
      { kolom: "pctTidakPunyaPerencanaLK", definisi: "% Sekolah Memiliki Perencana (dibalik dari sheet). Tidak ada lagi versi Aplikasi terpisah untuk dibandingkan (beda dari v1).", sumberData: "LK Fasil", bobot: 4 },
    ],
  },
  {
    no: 8,
    name: "Dokumen admin terunggah",
    activeFromDay: 4,
    bobotTotal: 12,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen admin terunggahnya di bawah target, dan gambaran perlunya pembinaan fasilitator terkait percepatan unggah dokumen oleh sekolah.",
    indicators: [
      { kolom: "pctDokAdminTerunggahLengkap", definisi: "% sekolah dengan dokumen admin terunggah 100% (lengkap).", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
      { kolom: "rataDokAdminTerunggah", definisi: "Rata-rata % Dok. Admin Terunggah antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
      { kolom: "minDokAdminTerunggah", definisi: "Nilai minimum % Dok. Admin Terunggah antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 9,
    name: "Dokumen admin terverifikasi",
    activeFromDay: 5,
    bobotTotal: 15,
    tujuan: "Memberi alert bahwa ada sekolah yang masih banyak dokumen adminnya belum diverifikasi, dan gambaran perlunya pembinaan fasilitator untuk segera memverifikasi dokumen.",
    indicators: [
      { kolom: "pctDokAdminTerverifikasi", definisi: "% sekolah dengan dokumen admin terverifikasi.", sumberData: "Aplikasi Revit", bobot: 5, polarity: "higherIsBetter" },
      { kolom: "rataDokAdminTerverifikasi", definisi: "Rata-rata % Dok. Admin Terverifikasi antar sekolah.", sumberData: "Aplikasi Revit", bobot: 5, polarity: "higherIsBetter" },
      { kolom: "minDokAdminTerverifikasi", definisi: "Nilai minimum % Dok. Admin Terverifikasi antar sekolah.", sumberData: "Aplikasi Revit", bobot: 5, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 10,
    name: "Dokumen admin sesuai",
    activeFromDay: 7,
    bobotTotal: 21,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen admin sesuainya di bawah target, dan gambaran perlunya pembinaan fasilitator terkait peningkatan kualitas pendampingan dan percepatan verifikasi.",
    indicators: [
      { kolom: "pctDokAdminSesuai", definisi: "% sekolah dengan dokumen admin sesuai.", sumberData: "Aplikasi Revit", bobot: 7, polarity: "higherIsBetter" },
      { kolom: "rataDokAdminSesuai", definisi: "Rata-rata % Dok. Admin Sesuai antar sekolah.", sumberData: "Aplikasi Revit", bobot: 7, polarity: "higherIsBetter" },
      { kolom: "minDokAdminSesuai", definisi: "Nilai minimum % Dok. Admin Sesuai antar sekolah.", sumberData: "Aplikasi Revit", bobot: 7, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 11,
    name: "Dokumen teknis terunggah",
    activeFromDay: 7,
    bobotTotal: 21,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen teknis terunggahnya di bawah target, dan gambaran perlunya pembinaan fasilitator terkait percepatan unggah dokumen oleh sekolah.",
    indicators: [
      { kolom: "pctDokTeknisTerunggahLengkap", definisi: "% sekolah dengan dokumen teknis terunggah 100% (lengkap).", sumberData: "Aplikasi Revit", bobot: 7, polarity: "higherIsBetter" },
      { kolom: "rataDokTeknisTerunggah", definisi: "Rata-rata % Dok. Teknis Terunggah antar sekolah.", sumberData: "Aplikasi Revit", bobot: 7, polarity: "higherIsBetter" },
      { kolom: "minDokTeknisTerunggah", definisi: "Nilai minimum % Dok. Teknis Terunggah antar sekolah.", sumberData: "Aplikasi Revit", bobot: 7, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 12,
    name: "Dokumen teknis terverifikasi",
    activeFromDay: 8,
    bobotTotal: 24,
    tujuan: "Memberi alert bahwa ada sekolah yang masih banyak dokumen teknisnya belum diverifikasi, dan gambaran perlunya pembinaan fasilitator untuk segera memverifikasi dokumen.",
    indicators: [
      { kolom: "pctDokTeknisTerverifikasi", definisi: "% sekolah dengan dokumen teknis terverifikasi.", sumberData: "Aplikasi Revit", bobot: 8, polarity: "higherIsBetter" },
      { kolom: "rataDokTeknisTerverifikasi", definisi: "Rata-rata % Dok. Teknis Terverifikasi antar sekolah.", sumberData: "Aplikasi Revit", bobot: 8, polarity: "higherIsBetter" },
      { kolom: "minDokTeknisTerverifikasi", definisi: "Nilai minimum % Dok. Teknis Terverifikasi antar sekolah.", sumberData: "Aplikasi Revit", bobot: 8, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 13,
    name: "Dokumen teknis sesuai",
    activeFromDay: 10,
    bobotTotal: 30,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen teknis sesuainya di bawah target, dan gambaran perlunya pembinaan fasilitator terkait peningkatan kualitas pendampingan dan percepatan verifikasi.",
    indicators: [
      { kolom: "pctDokTeknisSesuai", definisi: "% sekolah dengan dokumen teknis sesuai.", sumberData: "Aplikasi Revit", bobot: 10, polarity: "higherIsBetter" },
      { kolom: "rataDokTeknisSesuai", definisi: "Rata-rata % Dok. Teknis Sesuai antar sekolah.", sumberData: "Aplikasi Revit", bobot: 10, polarity: "higherIsBetter" },
      { kolom: "minDokTeknisSesuai", definisi: "Nilai minimum % Dok. Teknis Sesuai antar sekolah.", sumberData: "Aplikasi Revit", bobot: 10, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 14,
    name: "RAB sepakat",
    activeFromDay: 12,
    bobotTotal: 12,
    tujuan: "Memantau kesepakatan RAB usulan antara sekolah dan fasilitator menjelang akhir siklus pendampingan.",
    indicators: [
      { kolom: "pctBelumSepakatRAB", definisi: "% Sekolah Sepakat RAB (dibalik dari sheet).", sumberData: "Aplikasi Revit", bobot: 12 },
    ],
  },
];

/** Non-checkpoint columns (identitas & catatan kualitatif) - dipakai supaya
 * InfoTooltip & prompt LLM tetap punya penjelasan untuk semua kolom. */
export const DESCRIPTIVE_COLUMNS: Partial<Record<keyof FacilRow, string>> = {
  atmin: "Admin/PIC yang bertanggung jawab memantau fasilitator ini.",
  hariLabel: "Hari ke berapa dalam siklus pendampingan 14 hari.",
  kodeFasil: "Kode unik fasilitator.",
  namaFasil: "Nama fasilitator.",
  kodeKoor: "Kode unik koordinator yang membawahi fasilitator ini.",
  namaKoor: "Nama koordinator yang membawahi fasilitator ini.",
  penyusunanDokAdminTerkendala: "Catatan hasil LK terkait kendala penyusunan dokumen admin.",
  penyusunanDokTeknisTerkendala: "Catatan hasil LK terkait kendala penyusunan dokumen teknis.",
  kendalaKomunikasi: "Penjelasan bebas dari fasilitator/admin soal kendala komunikasi dengan sekolah.",
  kendalaPanlakFormatTemplate: "Penjelasan bebas soal kendala memiliki Panlak/format/template dokumen.",
  kendalaMendapatkanPerencana: "Penjelasan bebas soal kendala mendapatkan perencana.",
  kendalaVerifikasiBiodata: "Penjelasan bebas soal kendala verifikasi biodata oleh fasilitator.",
  kendalaUpdateDapodik: "Penjelasan bebas soal kendala update Dapodik.",
  kendalaPenyusunanDokAdmin: "Penjelasan bebas soal kendala penyusunan dokumen admin.",
  kendalaVerifikasiDokAdmin: "Penjelasan bebas soal kendala verifikasi dokumen admin oleh fasilitator.",
  kendalaPenyusunanDokTeknis: "Penjelasan bebas soal kendala penyusunan dokumen teknis.",
  kendalaVerifikasiDokTeknis: "Penjelasan bebas soal kendala verifikasi dokumen teknis oleh fasilitator.",
  kendalaPenyepakatanRAB: "Penjelasan bebas soal kendala penyepakatan RAB.",
  analisis: "Analisis kualitatif yang sudah ditulis manusia (admin) untuk hari ini - konteks tambahan yang harus dipertimbangkan, bukan diduplikasi.",
  catatanAdmin: "Catatan tambahan dari admin, termasuk klarifikasi atas data yang tampak ambigu.",
};

/** Semua checkpoint (nomor urut) yang sudah aktif/berlaku pada hari ke-N. */
export function activeCheckpoints(hari: number): CheckpointGroup[] {
  return CHECKPOINT_GROUPS.filter((c) => c.activeFromDay <= hari);
}

/** Cari definisi & bobot suatu kolom (jika ia bagian dari checkpoint). */
export function findIndicator(kolom: keyof FacilRow): { group: CheckpointGroup; indicator: CheckpointIndicator } | null {
  for (const group of CHECKPOINT_GROUPS) {
    const indicator = group.indicators.find((i) => i.kolom === kolom);
    if (indicator) return { group, indicator };
  }
  return null;
}

/** Ringkasan knowledge base dalam bentuk teks, dibatasi hanya checkpoint yang
 * sudah relevan pada hari tsb - dipakai sebagai konteks system prompt LLM.
 * `excludeAplikasi` = true membuang seluruh indikator ber-sumber "Aplikasi
 * Revit" (dan checkpoint yang jadi kosong total setelahnya) - dipakai saat
 * admin cuma mau analisis berbasis catatan Kendala/LK Fasil, tanpa persentase
 * dari Aplikasi (mis. Dokumen Admin/Teknis) ikut jadi bahan kesimpulan. */
export function buildKnowledgeSummary(uptoDay: number, excludeAplikasi = false): string {
  const lines: string[] = [];
  for (const group of activeCheckpoints(uptoDay)) {
    const indicators = excludeAplikasi ? group.indicators.filter((i) => i.sumberData !== "Aplikasi Revit") : group.indicators;
    if (indicators.length === 0) continue;
    lines.push(`- [${group.name}] (aktif sejak Hari ${group.activeFromDay}, bobot risiko total ${group.bobotTotal}) - Tujuan: ${group.tujuan}`);
    for (const ind of indicators) {
      const bobotNote = ind.bobot > 0 ? ` (bobot ${ind.bobot})` : "";
      lines.push(`    - ${ind.kolom}${bobotNote}: ${ind.definisi} [sumber: ${ind.sumberData ?? "-"}]`);
    }
  }
  const notYetActive = CHECKPOINT_GROUPS.filter((c) => c.activeFromDay > uptoDay);
  if (notYetActive.length > 0) {
    lines.push("");
    lines.push("Checkpoint yang BELUM relevan/berlaku pada hari ini (jangan jadikan red flag jika kosong):");
    for (const c of notYetActive) {
      lines.push(`- ${c.name} (baru aktif Hari ${c.activeFromDay})`);
    }
  }
  return lines.join("\n");
}
