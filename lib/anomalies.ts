import { KEY_TO_HEADER } from "./columns";
import { QUALITATIVE_FIELDS } from "./notes";
import type { FacilRow } from "./types";

export type AnomalyType = "future_data" | "never_logged_in" | "lk_aplikasi_mismatch" | "contradicted_zero";

export interface AnomalyItem {
  type: AnomalyType;
  severity: "tinggi" | "sedang";
  detail: string;
}

export interface FacilitatorAnomalyReport {
  kodeFasil: string;
  namaFasil: string;
  items: AnomalyItem[];
}

const BELUM_DIISI_PATTERN = /belum\s*(di\s*)?isi|belum\s+mengisi|belum\s+ada\s+data|kosong/i;

/** Pasangan kolom "Hasil LK" vs "Aplikasi" yang seharusnya menceritakan hal
 * yang sama - kalau bertolak belakang jauh, salah satunya patut dicurigai. */
const LK_APLIKASI_PAIRS: Array<{ lk: keyof FacilRow; aplikasi: keyof FacilRow; label: string }> = [
  { lk: "pctTidakPunyaPerencanaLK", aplikasi: "pctTidakPunyaPerencanaAplikasi", label: "Perencana" },
];

/** Kolom "% masalah" ber-sumber LK Fasil yang punya kolom Kendala terkait -
 * dipakai untuk mendeteksi 0% yang dikontradiksi catatan "belum diisi". */
const ZERO_CHECKS: Array<{ kolom: keyof FacilRow; kendala: keyof FacilRow }> = [
  { kolom: "pctTidakPunyaPanlak", kendala: "kendalaPanlakFormatTemplate" },
  { kolom: "pctTidakPunyaFormatTemplate", kendala: "kendalaPanlakFormatTemplate" },
  { kolom: "pctTidakPunyaPerencanaLK", kendala: "kendalaMendapatkanPerencana" },
  { kolom: "pctDapodikTidakSesuaiBelumUpdate", kendala: "kendalaUpdateDapodik" },
];

function label(kolom: keyof FacilRow): string {
  return KEY_TO_HEADER[kolom] ?? String(kolom);
}

/**
 * Mendeteksi anomali untuk satu fasilitator (history = seluruh baris hari
 * yang tersedia, sudah terurut naik). Empat jenis:
 * 1. future_data - kolom kualitatif sudah berisi konten asli untuk hari yang
 *    belum terjadi (lebih besar dari todayHari) - mencurigakan karena data
 *    itu ditulis manusia, seharusnya belum ada apa-apa untuk hari yang belum
 *    tiba.
 * 2. never_logged_in - fasilitator belum pernah login/isi LK sama sekali.
 * 3. lk_aplikasi_mismatch - kolom yang punya versi "Hasil LK" dan "Aplikasi"
 *    saling bertolak belakang jauh (>=40 poin persentase).
 * 4. contradicted_zero - kolom "% masalah" ber-sumber LK Fasil terbaca 0%,
 *    tapi catatan Kendala terkait bilang itu belum diisi (indikasi 0% cuma
 *    default kosong, bukan hasil verifikasi).
 */
export function detectFacilitatorAnomalies(history: FacilRow[], todayHari: number): AnomalyItem[] {
  const items: AnomalyItem[] = [];
  if (history.length === 0) return items;
  const latest = history[history.length - 1];

  for (const row of history) {
    if (row.hari <= todayHari) continue;
    for (const field of QUALITATIVE_FIELDS) {
      const v = row[field.key];
      if (typeof v === "string" && v.trim() !== "" && v !== "Belum Diisi") {
        items.push({
          type: "future_data",
          severity: "tinggi",
          detail: `Hari ${row.hari} (belum terjadi, hari ini Hari ${todayHari}) sudah berisi "${field.label}": "${v}"`,
        });
      }
    }
  }

  if (latest.fasilBelumLoginLK === "Belum") {
    items.push({ type: "never_logged_in", severity: "tinggi", detail: "Belum pernah login/mengisi LK sama sekali." });
  }

  for (const pair of LK_APLIKASI_PAIRS) {
    const lkVal = latest[pair.lk];
    const appVal = latest[pair.aplikasi];
    if (typeof lkVal === "number" && typeof appVal === "number" && Math.abs(appVal - lkVal) >= 40) {
      items.push({
        type: "lk_aplikasi_mismatch",
        severity: "sedang",
        detail: `${pair.label}: Hasil LK=${lkVal}% vs Aplikasi=${appVal}% (selisih ${Math.abs(appVal - lkVal)} poin).`,
      });
    }
  }

  if (latest.fasilBelumLoginLK !== "Belum") {
    for (const check of ZERO_CHECKS) {
      const val = latest[check.kolom];
      const kendala = latest[check.kendala];
      if (val === 0 && typeof kendala === "string" && BELUM_DIISI_PATTERN.test(kendala)) {
        items.push({
          type: "contradicted_zero",
          severity: "sedang",
          detail: `"${label(check.kolom)}" terbaca 0% tapi catatan "${label(check.kendala)}" bilang: "${kendala}".`,
        });
      }
    }
  }

  return items;
}

/** Menjalankan deteksi anomali untuk seluruh fasilitator di `rows` (output
 * getFacilRows()), diurutkan dari yang paling banyak anomalinya. */
export function scanAllAnomalies(rows: FacilRow[], todayHari: number): FacilitatorAnomalyReport[] {
  const byFasil = new Map<string, FacilRow[]>();
  for (const r of rows) {
    if (!byFasil.has(r.kodeFasil)) byFasil.set(r.kodeFasil, []);
    byFasil.get(r.kodeFasil)!.push(r);
  }

  const reports: FacilitatorAnomalyReport[] = [];
  for (const [kodeFasil, history] of byFasil) {
    const sorted = [...history].sort((a, b) => a.hari - b.hari);
    const items = detectFacilitatorAnomalies(sorted, todayHari);
    if (items.length > 0) {
      reports.push({ kodeFasil, namaFasil: sorted[sorted.length - 1].namaFasil, items });
    }
  }
  return reports.sort((a, b) => b.items.length - a.items.length);
}
