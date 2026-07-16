import { getFacilitatorLkCsvUrl } from "./facilitatorLkLinks";

/**
 * Kolom mentah LK Fasil (wawancara per sekolah) - di v1 ini "kolom A-AQ" dari
 * template LAMA (lihat uwu-project-v1/lib/facilitatorLk.ts). Program sekarang
 * pakai "LK baru" yang strukturnya belum dikonfirmasi sama - JANGAN asumsikan
 * sama dengan template lama sebelum dicek langsung ke satu contoh sheet LK
 * Fasil yang sebenarnya. Begitu strukturnya pasti, isi ulang daftar ini
 * (dan HEADER_ANCHOR di bawah) mengikuti header sheet yang sebenarnya.
 */
export const LK_SUMMARY_COLUMNS: string[] = [];

export interface LkFasilResult {
  available: boolean;
  error?: string;
  rows: Record<string, string>[];
}

/**
 * BELUM DIIMPLEMENTASIKAN - menunggu (1) akses spreadsheet controller supaya
 * link LK per fasilitator bisa ditemukan (lib/controller.ts), dan (2)
 * struktur kolom LK Fasil baru dikonfirmasi (LK_SUMMARY_COLUMNS di atas).
 * Begitu dua hal itu jelas, isi fungsi ini mengikuti pola yang SAMA PERSIS
 * dengan uwu-project-v1/lib/facilitatorLk.ts::getFacilitatorLkRows (fetch CSV
 * publik, cari baris header lewat HEADER_ANCHOR, Papa.parse, filter ke
 * "Hari ke-" tertentu kalau diminta) - referensi lengkap ada di file itu.
 *
 * Di v2 fungsi ini dipanggil DUA kali lipat pentingnya dibanding v1: bukan
 * cuma buat panel "LK Fasilitator" di halaman detail, tapi juga jadi BAHAN
 * AGREGASI utama lib/sheet.ts::getFacilRows() (lihat catatan di sana) - satu
 * implementasi di sini dipakai dua-duanya.
 */
export async function getFacilitatorLkRows(kodeFasil: string, hari?: number): Promise<LkFasilResult> {
  const csvUrl = await getFacilitatorLkCsvUrl(kodeFasil);
  const hariNote = typeof hari === "number" ? ` (Hari ${hari})` : "";
  if (!csvUrl) {
    return {
      available: false,
      error: `Sheet LK fasilitator "${kodeFasil}"${hariNote} belum ditemukan - controller belum dikonfigurasi/diimplementasikan (lihat lib/controller.ts).`,
      rows: [],
    };
  }
  return {
    available: false,
    error: `Belum diimplementasikan untuk "${kodeFasil}"${hariNote} - struktur kolom LK Fasil baru belum dikonfirmasi (lihat komentar di lib/facilitatorLk.ts).`,
    rows: [],
  };
}
