import type { FacilRow } from "@uwu/core/types";

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
}

export const SKOR_AKHIR_COLUMNS: SkorAkhirColumn[] = [
  { header: "% Sekolah Sudah Dihubungi/Terhubung", kolom: "pctSekolahBelumDihubungi", bobot: 2, invert: true },
  { header: "% Sekolah Sudah Login Aplikasi", kolom: "pctSekolahBelumLoginAplikasi", bobot: 2, invert: true },
  { header: "% Sekolah Sudah Memiliki Panlak", kolom: "pctTidakPunyaPanlak", bobot: 2, invert: true },
  { header: "% Sekolah Sudah Memiliki Format/Template", kolom: "pctTidakPunyaFormatTemplate", bobot: 2, invert: true },
  { header: "% Sekolah Biodata Sudah Terverifikasi Sesuai", kolom: "pctBiodataBelumTerverifikasi", bobot: 3, invert: true },
  { header: "% Sekolah Sudah Upload Bukti Update Dapodik", kolom: "pctSudahUploadBuktiUpdateDapodik", bobot: 4, invert: false },
  { header: "% Sekolah Memiliki Perencana", kolom: "pctTidakPunyaPerencanaLK", bobot: 4, invert: true },
  { header: "% Sekolah Dok. Admin Terunggah 100% (Lengkap)", kolom: "pctDokAdminTerunggahLengkap", bobot: 4, invert: false },
  { header: "Rata-rata % Dok. Admin Terunggah (aplikasi)", kolom: "rataDokAdminTerunggah", bobot: 4, invert: false },
  { header: "Min (% Dok. Admin Terunggah)", kolom: "minDokAdminTerunggah", bobot: 4, invert: false },
  { header: "% Sekolah Dok. Admin Terverifikasi", kolom: "pctDokAdminTerverifikasi", bobot: 5, invert: false },
  { header: "Rata-rata % Dok. Admin Terverifikasi", kolom: "rataDokAdminTerverifikasi", bobot: 5, invert: false },
  { header: "Min (% Dok. Admin Terverifikasi)", kolom: "minDokAdminTerverifikasi", bobot: 5, invert: false },
  { header: "% Sekolah Dok. Admin Sesuai", kolom: "pctDokAdminSesuai", bobot: 7, invert: false },
  { header: "Rata-rata % Dok. Admin Sesuai", kolom: "rataDokAdminSesuai", bobot: 7, invert: false },
  { header: "Min (% Dok. Admin Sesuai)", kolom: "minDokAdminSesuai", bobot: 7, invert: false },
  { header: "% Sekolah Dok. Teknis Terunggah 100% (Lengkap)", kolom: "pctDokTeknisTerunggahLengkap", bobot: 7, invert: false },
  { header: "Rata-rata % Dok. Teknis Terunggah", kolom: "rataDokTeknisTerunggah", bobot: 7, invert: false },
  { header: "Min (% Dok. Teknis Terunggah)", kolom: "minDokTeknisTerunggah", bobot: 7, invert: false },
  { header: "% Sekolah Dok. Teknis Terverifikasi", kolom: "pctDokTeknisTerverifikasi", bobot: 8, invert: false },
  { header: "Rata-rata % Dok. Teknis Terverifikasi", kolom: "rataDokTeknisTerverifikasi", bobot: 8, invert: false },
  { header: "Min (% Dok. Teknis Terverifikasi)", kolom: "minDokTeknisTerverifikasi", bobot: 8, invert: false },
  { header: "% Sekolah Dok Teknis Sesuai", kolom: "pctDokTeknisSesuai", bobot: 10, invert: false },
  { header: "Rata-rata % Dok. Teknis Sesuai", kolom: "rataDokTeknisSesuai", bobot: 10, invert: false },
  { header: "Min (% Dok. Teknis Sesuai)", kolom: "minDokTeknisSesuai", bobot: 10, invert: false },
  { header: "% Sekolah Sepakat RAB", kolom: "pctBelumSepakatRAB", bobot: 12, invert: true },
];

export function parsePercentCell(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "#DIV/0!") return null;
  const cleaned = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
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
