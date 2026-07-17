import { findIndicator } from "@uwu/core/knowledge/checkpoints";
import type { CellValue, FacilRow } from "@uwu/core/types";

/**
 * Pemetaan 26 kolom "Skor Akhir" (dikonfirmasi program owner, 2026-07-16) ke
 * `FacilRow` yang dipakai packages/core - lihat catatan lengkap di
 * packages/core/knowledge/checkpoints.ts kenapa beberapa kolom perlu dibalik
 * (100 - nilai) dan beberapa tidak.
 *
 * `invert: true` = kolom sheet framing-nya POSITIF ("Sudah X"/"Memiliki X")
 * tapi field FacilRow tujuannya framing "% masalah" (warisan v1, supaya
 * packages/core/prompts.ts tidak perlu berubah) - dibalik saat parsing.
 * `invert: false` = kolom sheet framing-nya SUDAH SAMA dengan field FacilRow
 * tujuannya (kelengkapan dokumen dkk. - field-field ini "higherIsBetter"
 * bahkan di v1) - dipakai apa adanya.
 */
export interface SkorAkhirColumn {
  header: string;
  kolom: keyof FacilRow;
  bobot: number;
  invert: boolean;
  /** Label singkat per-kolom buat header tabel ringkas (TodayLogPanel) - "%",
   * "Rata", "Min" untuk kolom yang berbagi satu checkpoint dengan 2 kolom
   * lain, atau nama pendek metrik itu sendiri kalau checkpoint-nya cuma
   * punya kolom ini saja. Nomor checkpoint-nya SENDIRI (label baris pertama
   * header, dua kolom bisa satu checkpoint) tidak disimpan di sini - selalu
   * di-derive dari packages/core/knowledge/checkpoints.ts lewat
   * groupSkorAkhirColumns() di bawah, supaya tidak ada dua sumber kebenaran
   * yang bisa saling drift. */
  short: string;
}

export const SKOR_AKHIR_COLUMNS: SkorAkhirColumn[] = [
  { header: "% Sekolah Sudah Dihubungi/Terhubung", kolom: "pctSekolahBelumDihubungi", bobot: 2, invert: true, short: "Dihubungi" },
  { header: "% Sekolah Sudah Login Aplikasi", kolom: "pctSekolahBelumLoginAplikasi", bobot: 2, invert: true, short: "Login App" },
  { header: "% Sekolah Sudah Memiliki Panlak", kolom: "pctTidakPunyaPanlak", bobot: 2, invert: true, short: "Panlak" },
  { header: "% Sekolah Sudah Memiliki Format/Template", kolom: "pctTidakPunyaFormatTemplate", bobot: 2, invert: true, short: "Format" },
  { header: "% Sekolah Biodata Sudah Terverifikasi Sesuai", kolom: "pctBiodataBelumTerverifikasi", bobot: 3, invert: true, short: "Biodata" },
  { header: "% Sekolah Sudah Upload Bukti Update Dapodik", kolom: "pctSudahUploadBuktiUpdateDapodik", bobot: 4, invert: false, short: "Dapodik" },
  { header: "% Sekolah Memiliki Perencana", kolom: "pctTidakPunyaPerencanaLK", bobot: 4, invert: true, short: "Perencana" },
  { header: "% Sekolah Dok. Admin Terunggah 100% (Lengkap)", kolom: "pctDokAdminTerunggahLengkap", bobot: 4, invert: false, short: "%" },
  { header: "Rata-rata % Dok. Admin Terunggah (aplikasi)", kolom: "rataDokAdminTerunggah", bobot: 4, invert: false, short: "Rata" },
  { header: "Min (% Dok. Admin Terunggah)", kolom: "minDokAdminTerunggah", bobot: 4, invert: false, short: "Min" },
  { header: "% Sekolah Dok. Admin Terverifikasi", kolom: "pctDokAdminTerverifikasi", bobot: 5, invert: false, short: "%" },
  { header: "Rata-rata % Dok. Admin Terverifikasi", kolom: "rataDokAdminTerverifikasi", bobot: 5, invert: false, short: "Rata" },
  { header: "Min (% Dok. Admin Terverifikasi)", kolom: "minDokAdminTerverifikasi", bobot: 5, invert: false, short: "Min" },
  { header: "% Sekolah Dok. Admin Sesuai", kolom: "pctDokAdminSesuai", bobot: 7, invert: false, short: "%" },
  { header: "Rata-rata % Dok. Admin Sesuai", kolom: "rataDokAdminSesuai", bobot: 7, invert: false, short: "Rata" },
  { header: "Min (% Dok. Admin Sesuai)", kolom: "minDokAdminSesuai", bobot: 7, invert: false, short: "Min" },
  { header: "% Sekolah Dok. Teknis Terunggah 100% (Lengkap)", kolom: "pctDokTeknisTerunggahLengkap", bobot: 7, invert: false, short: "%" },
  { header: "Rata-rata % Dok. Teknis Terunggah", kolom: "rataDokTeknisTerunggah", bobot: 7, invert: false, short: "Rata" },
  { header: "Min (% Dok. Teknis Terunggah)", kolom: "minDokTeknisTerunggah", bobot: 7, invert: false, short: "Min" },
  { header: "% Sekolah Dok. Teknis Terverifikasi", kolom: "pctDokTeknisTerverifikasi", bobot: 8, invert: false, short: "%" },
  { header: "Rata-rata % Dok. Teknis Terverifikasi", kolom: "rataDokTeknisTerverifikasi", bobot: 8, invert: false, short: "Rata" },
  { header: "Min (% Dok. Teknis Terverifikasi)", kolom: "minDokTeknisTerverifikasi", bobot: 8, invert: false, short: "Min" },
  { header: "% Sekolah Dok Teknis Sesuai", kolom: "pctDokTeknisSesuai", bobot: 10, invert: false, short: "%" },
  { header: "Rata-rata % Dok. Teknis Sesuai", kolom: "rataDokTeknisSesuai", bobot: 10, invert: false, short: "Rata" },
  { header: "Min (% Dok. Teknis Sesuai)", kolom: "minDokTeknisSesuai", bobot: 10, invert: false, short: "Min" },
  { header: "% Sekolah Sepakat RAB", kolom: "pctBelumSepakatRAB", bobot: 12, invert: true, short: "RAB" },
];

export interface SkorAkhirHeaderGroup {
  /** Nomor checkpoint asli (1-14, packages/core/knowledge/checkpoints.ts) -
   * label baris pertama header. 0 kalau kolom ini (seharusnya tidak pernah
   * terjadi untuk SKOR_AKHIR_COLUMNS - semuanya SEHARUSNYA punya checkpoint,
   * tapi dijaga null-safe kalau suatu saat kolom baru ditambah sebelum
   * dipetakan ke checkpoints.ts). */
  checkpointNo: number;
  checkpointName: string;
  activeFromDay: number;
  span: number;
  cols: SkorAkhirColumn[];
}

/** Kelompokkan SKOR_AKHIR_COLUMNS yang berurutan & satu checkpoint yang sama
 * (via findIndicator, BUKAN field lokal supaya tidak ada dua sumber
 * kebenaran) jadi satu header spanning (dipakai tabel ringkas dua-baris
 * header, mis. TodayLogPanel) - supaya nomor checkpoint (mis. "8" untuk
 * checkpoint "Dokumen admin terunggah", yang py 3 kolom %/Rata/Min) cuma
 * muncul SEKALI membentang 3 kolom, bukan diulang 3x. */
export function groupSkorAkhirColumns(columns: SkorAkhirColumn[] = SKOR_AKHIR_COLUMNS): SkorAkhirHeaderGroup[] {
  const groups: SkorAkhirHeaderGroup[] = [];
  for (const col of columns) {
    const found = findIndicator(col.kolom);
    const checkpointNo = found?.group.no ?? 0;
    const last = groups[groups.length - 1];
    if (last && last.checkpointNo === checkpointNo) {
      last.span += 1;
      last.cols.push(col);
    } else {
      groups.push({
        checkpointNo,
        checkpointName: found?.group.name ?? "?",
        activeFromDay: found?.group.activeFromDay ?? 0,
        span: 1,
        cols: [col],
      });
    }
  }
  return groups;
}

export function parsePercentCell(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "#DIV/0!") return null;
  const cleaned = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

/** Kelas warna sel tabel raw (RawMatriksTable/TodayLogPanel) berdasar nilai
 * persen mentahnya - dipisah supaya threshold-nya (100/90/50) tidak
 * ke-duplikasi berbeda-beda di tiap tabel yang menampilkan sel yang sama. */
export function percentCellColorClass(rawValue: string): string {
  if (!rawValue.includes("%")) return "text-ink-primary";
  const num = parseFloat(rawValue);
  if (Number.isNaN(num)) return "text-ink-primary";
  if (num === 100) return "bg-status-good/20 text-ink-primary font-medium";
  if (num < 50) return "bg-status-critical/20 text-ink-primary font-medium";
  // Semua yang BELUM 100% (dan bukan <50% "kritis") kuning - sebelumnya ada
  // celah 90-99.99% yang jatuh ke "tidak ada warna" (putih polos), padahal
  // itu tetap "belum selesai".
  return "bg-status-warning/20 text-ink-primary font-medium";
}

/** Sama seperti percentCellColorClass, tapi terima number langsung (bukan
 * string sel mentah "xx.xx%") - dipakai kolom "Nilai Akhir"/"Skor Akhir"
 * yang datanya sudah angka di FacilRow.skorAkhir. */
export function skorAkhirColorClass(value: CellValue | undefined): string {
  if (typeof value !== "number") return "text-ink-primary";
  if (value === 100) return "bg-status-good/20 text-ink-primary font-medium";
  if (value < 50) return "bg-status-critical/20 text-ink-primary font-medium";
  return "bg-status-warning/20 text-ink-primary font-medium";
}

/** Menerapkan SKOR_AKHIR_COLUMNS ke satu baris CSV mentah (Papa.parse
 * header:true), membalik kolom yang perlu dibalik supaya hasilnya konsisten
 * dengan framing FacilRow yang dipakai packages/core - lihat komentar di atas. */
export function applySkorAkhirColumns(raw: Record<string, string>): Partial<FacilRow> {
  const result: Partial<FacilRow> = {};
  for (const col of SKOR_AKHIR_COLUMNS) {
    const value = parsePercentCell(raw[col.header]);
    if (value == null) continue;
    (result as Record<string, number>)[col.kolom] = col.invert ? 100 - value : value;
  }
  return result;
}
