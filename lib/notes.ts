import type { FacilRow } from "./types";

/** Kolom kualitatif (Kendala/Analisis/Catatan Admin) - dipakai bareng oleh
 * halaman detail fasilitator, prompt LLM, dan pemindai anomali supaya
 * daftarnya tidak duplikat di banyak tempat. */
export const QUALITATIVE_FIELDS: ReadonlyArray<{ key: keyof FacilRow; label: string }> = [
  { key: "kendalaKomunikasi", label: "Kendala Komunikasi" },
  { key: "kendalaPanlakFormatTemplate", label: "Kendala Panlak/Format/Template" },
  { key: "kendalaMendapatkanPerencana", label: "Kendala Mendapatkan Perencana" },
  { key: "kendalaVerifikasiBiodata", label: "Kendala Verifikasi Biodata" },
  { key: "kendalaUpdateDapodik", label: "Kendala Update Dapodik" },
  { key: "kendalaPenyusunanDokAdmin", label: "Kendala Penyusunan Dok. Admin" },
  { key: "kendalaVerifikasiDokAdmin", label: "Kendala Verifikasi Dok. Admin" },
  { key: "kendalaPenyusunanDokTeknis", label: "Kendala Penyusunan Dok. Teknis" },
  { key: "kendalaVerifikasiDokTeknis", label: "Kendala Verifikasi Dok. Teknis" },
  { key: "kendalaPenyepakatanRAB", label: "Kendala Penyepakatan RAB" },
  { key: "analisis", label: "Analisis (admin)" },
  { key: "catatanAdmin", label: "Catatan Admin" },
];

export interface NoteRange {
  key: string;
  label: string;
  text: string;
  hariStart: number;
  hariEnd: number;
}

/**
 * Mengelompokkan isi kolom kualitatif (Kendala/Analisis/Catatan Admin) per
 * hari menjadi rentang hari yang berurutan dengan teks identik, supaya "Belum
 * Diisi" 5 hari berturut-turut tampil sebagai satu baris "Hari 2-6", bukan
 * diulang 5x. `include` memfilter teks mana yang mau diikutsertakan (dipakai
 * untuk memisahkan catatan asli vs penanda "belum diisi").
 */
export function buildNoteRanges(
  history: FacilRow[],
  fields: ReadonlyArray<{ key: keyof FacilRow; label: string }>,
  include: (text: string) => boolean
): NoteRange[] {
  const ranges: NoteRange[] = [];
  for (const field of fields) {
    let current: { text: string; start: number; end: number } | null = null;
    const flush = () => {
      if (current) {
        ranges.push({ key: String(field.key), label: field.label, text: current.text, hariStart: current.start, hariEnd: current.end });
      }
      current = null;
    };
    for (const row of history) {
      const raw = row[field.key];
      const text = typeof raw === "string" ? raw.trim() : "";
      const matches = text !== "" && include(text);
      if (matches) {
        if (current && current.text === text && row.hari === current.end + 1) {
          current.end = row.hari;
        } else {
          flush();
          current = { text, start: row.hari, end: row.hari };
        }
      } else {
        flush();
      }
    }
    flush();
  }
  return ranges;
}

export function formatHariRange(r: NoteRange): string {
  return r.hariStart === r.hariEnd ? `Hari ${r.hariStart}` : `Hari ${r.hariStart}-${r.hariEnd}`;
}
