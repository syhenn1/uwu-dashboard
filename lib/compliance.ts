import { activeCheckpoints } from "./knowledge/checkpoints";
import type { CheckpointGroup, CheckpointIndicator } from "./knowledge/checkpoints";
import { KEY_TO_HEADER } from "./columns";
import { LK_APLIKASI_PAIRS, MISMATCH_THRESHOLD } from "./anomalies";
import type { CheckpointSourceData, FacilRow } from "./types";

export type IndicatorStatus = "ok" | "violation" | "unknown";

/** Nilai pembanding dari sisi lain (LK <-> Aplikasi) untuk indikator yang
 * punya pasangan sungguhan di LK_APLIKASI_PAIRS - dipakai supaya panel tidak
 * cuma menampilkan satu sisi (mis. Aplikasi) padahal versi LK-nya juga ada. */
export interface IndicatorCounterpart {
  kolom: keyof FacilRow;
  label: string;
  value: number | null;
  selisih: number | null;
  konsisten: boolean;
}

export interface IndicatorCompliance {
  kolom: keyof FacilRow;
  label: string;
  status: IndicatorStatus;
  detail: string;
  sumberData: CheckpointSourceData;
  /** true kalau indikator ini penggerak status checkpoint (bobot > 0). */
  gating: boolean;
  /** Kenapa nilai "ok" mentah di sheet didowngrade jadi "unknown" (kalau ada). */
  note?: string;
  counterpart?: IndicatorCounterpart;
}

export interface CheckpointCompliance {
  group: CheckpointGroup;
  status: "sesuai" | "belum-sesuai" | "unknown";
  indicators: IndicatorCompliance[];
  /** Catatan "Kendala ..." dari Hasil LK terkait checkpoint ini (kalau diisi fasilitator) - konteks kualitatif sisi LK, dipakai juga untuk checkpoint yang datanya cuma bersumber Aplikasi.
   * `isIssue` = kendala ini genuinely melaporkan masalah dari hasil wawancara ke sekolah (bukan placeholder "belum diisi") - dipakai sebagai status LK tersirat: ada kendala berarti sisi LK-nya "Belum", tanpa perlu kolom status LK terpisah. */
  kendala?: { label: string; text: string; isIssue: boolean };
}

/** Kolom -> pasangannya di sisi lain (LK Fasil <-> Aplikasi Revit), dibangun
 * dari LK_APLIKASI_PAIRS supaya konsisten dengan anomaly detection. */
const COUNTERPART_MAP = new Map<keyof FacilRow, { kolom: keyof FacilRow; label: string }>();
for (const pair of LK_APLIKASI_PAIRS) {
  COUNTERPART_MAP.set(pair.lk, { kolom: pair.aplikasi, label: pair.label });
  COUNTERPART_MAP.set(pair.aplikasi, { kolom: pair.lk, label: pair.label });
}

function attachCounterpart(base: IndicatorCompliance, row: FacilRow): IndicatorCompliance {
  const counterpart = COUNTERPART_MAP.get(base.kolom);
  if (!counterpart) return base;
  const counterpartRaw = row[counterpart.kolom];
  const rawVal = row[base.kolom];
  const value = typeof counterpartRaw === "number" ? counterpartRaw : null;
  const rawNum = typeof rawVal === "number" ? rawVal : null;
  const selisih = value != null && rawNum != null ? Math.abs(value - rawNum) : null;
  return {
    ...base,
    counterpart: {
      kolom: counterpart.kolom,
      label: KEY_TO_HEADER[counterpart.kolom] ?? String(counterpart.kolom),
      value,
      selisih,
      konsisten: selisih != null ? selisih < MISMATCH_THRESHOLD : true,
    },
  };
}

/**
 * Beberapa checkpoint "Kolom LK Admin" punya kolom "Kendala ..." yang paling
 * relevan untuk memverifikasi apakah nilai 0%/"Sudah"-nya kredibel atau cuma
 * artefak sheet (tidak ada data = default 0%, bukan #DIV/0!). Dipetakan per
 * nomor checkpoint, bukan per kolom individual, karena satu kendala kadang
 * menaungi beberapa indikator (mis. checkpoint 3 & 4 sama-sama pakai kendala
 * Panlak/Format).
 */
const KENDALA_BY_CHECKPOINT: Partial<Record<number, keyof FacilRow>> = {
  1: "kendalaKomunikasi",
  3: "kendalaPanlakFormatTemplate",
  4: "kendalaPanlakFormatTemplate",
  5: "kendalaVerifikasiBiodata",
  6: "kendalaMendapatkanPerencana",
  7: "kendalaUpdateDapodik",
  8: "kendalaPenyusunanDokAdmin",
  9: "kendalaVerifikasiDokAdmin",
  11: "kendalaPenyusunanDokTeknis",
  12: "kendalaVerifikasiDokTeknis",
  14: "kendalaPenyepakatanRAB",
};

/** Frasa yang menandakan admin/fasilitator sendiri bilang datanya belum diisi -
 * ditemukan langsung di kasus nyata: "Panlak belum diisi, Format/Template
 * dokumen belum diisi" pada fasilitator yang % masalahnya kebaca 0.00%. */
const BELUM_DIISI_PATTERN = /belum\s*(di\s*)?isi|belum\s+mengisi|belum\s+ada\s+data|kosong/i;

/** Kolom "Hasil LK" yang punya versi pembanding "Aplikasi" - kalau keduanya
 * bertolak belakang jauh, versi LK-nya patut dicurigai, bukan otomatis dipakai. */
const APLIKASI_COUNTERPART: Partial<Record<keyof FacilRow, keyof FacilRow>> = {
  pctTidakPunyaPerencanaLK: "pctTidakPunyaPerencanaAplikasi",
};

/**
 * Menilai apakah nilai "ok" (0% masalah / "Sudah") dari sebuah indikator
 * ber-sumber "LK Fasil" layak dipercaya. Sengaja TIDAK hanya mengandalkan
 * "Fasil Belum Login LK" - itu cuma satu dari tiga sinyal yang dicek:
 * 1) fasilitator belum login LK sama sekali (indikasi paling kasar/menyeluruh)
 * 2) kolom "Kendala ..." terkait secara eksplisit menyebut "belum diisi"
 *    (menangkap kasus fasilitator SUDAH login tapi bagian ini belum ia isi)
 * 3) kalau ada versi "Aplikasi" pembanding, apakah keduanya konsisten
 * Kolom ber-sumber "Aplikasi Revit" tidak melalui pengecekan ini karena datanya
 * langsung dari aplikasi, bukan laporan mandiri fasilitator.
 */
function trustLkOkValue(row: FacilRow, group: CheckpointGroup, ind: CheckpointIndicator): string | null {
  if (row.fasilBelumLoginLK === "Belum") {
    return "Fasilitator belum login LK sama sekali, jadi kolom ini kemungkinan besar belum sungguh-sungguh terisi (0% bisa jadi default sheet, bukan hasil verifikasi).";
  }

  const kendalaKey = KENDALA_BY_CHECKPOINT[group.no];
  if (kendalaKey) {
    const kendalaVal = row[kendalaKey];
    if (typeof kendalaVal === "string" && BELUM_DIISI_PATTERN.test(kendalaVal)) {
      const label = KEY_TO_HEADER[kendalaKey] ?? String(kendalaKey);
      return `Catatan "${label}" menyebutkan ini belum diisi: "${kendalaVal}".`;
    }
  }

  const counterpartKey = APLIKASI_COUNTERPART[ind.kolom];
  if (counterpartKey) {
    const counterpartVal = row[counterpartKey];
    const rawVal = row[ind.kolom];
    if (typeof counterpartVal === "number" && typeof rawVal === "number" && counterpartVal - rawVal >= 40) {
      const label = KEY_TO_HEADER[counterpartKey] ?? String(counterpartKey);
      return `Tidak konsisten dengan "${label}" yang menunjukkan ${counterpartVal}% - versi Hasil LK dan Aplikasi berselisih jauh.`;
    }
  }

  return null;
}

function evaluateIndicator(row: FacilRow, group: CheckpointGroup, ind: CheckpointIndicator): IndicatorCompliance {
  const label = KEY_TO_HEADER[ind.kolom] ?? String(ind.kolom);
  const raw = row[ind.kolom];
  const sumberData = ind.sumberData;
  const gating = ind.bobot > 0;

  let status: IndicatorStatus;
  let detail: string;
  let note: string | undefined;

  if (ind.kolom === "fasilBelumLoginLK") {
    if (raw !== "Sudah" && raw !== "Belum") {
      status = "unknown";
      detail = "-";
    } else {
      status = raw === "Sudah" ? "ok" : "violation";
      detail = raw;
    }
  } else if (typeof raw !== "number") {
    status = "unknown";
    detail = "-";
  } else {
    const target = ind.polarity === "higherIsBetter" ? 100 : 0;
    const looksOk = raw === target;
    detail = `${raw}%`;
    status = looksOk ? "ok" : "violation";

    if (looksOk && sumberData === "LK Fasil") {
      const distrustReason = trustLkOkValue(row, group, ind);
      if (distrustReason) {
        status = "unknown";
        note = distrustReason;
      }
    }
  }

  return attachCounterpart({ kolom: ind.kolom, label, status, detail, note, sumberData, gating }, row);
}

/**
 * Mengecek, untuk checkpoint-checkpoint yang sudah jatuh tempo pada `todayHari`,
 * apakah indikator penggeraknya (bobot > 0) sudah sepenuhnya terpenuhi. Karena
 * kolom angka di sheet ternyata tidak berubah antar hari (lihat catatan di
 * lib/sheet.ts), ini membandingkan kondisi TERKINI fasilitator terhadap
 * checkpoint yang seharusnya sudah selesai per hari ini - bukan tren historis.
 *
 * Indikator ber-sumber LK Fasil yang tampak "ok" (0%) tapi tidak lolos
 * trustLkOkValue() didowngrade jadi "unknown" - mencegah nilai 0% yang
 * sebenarnya cuma artefak "belum ada data" terbaca sebagai kepatuhan asli.
 */
export function getCheckpointCompliance(row: FacilRow, todayHari: number): CheckpointCompliance[] {
  return activeCheckpoints(todayHari).map((group) => {
    const indicators = group.indicators.map((ind) => evaluateIndicator(row, group, ind));
    const gating = indicators.filter((i) => i.gating);
    const hasViolation = gating.some((i) => i.status === "violation");
    const hasUnknown = gating.some((i) => i.status === "unknown");
    const status: CheckpointCompliance["status"] = hasViolation ? "belum-sesuai" : hasUnknown ? "unknown" : "sesuai";

    const kendalaKey = KENDALA_BY_CHECKPOINT[group.no];
    const kendalaVal = kendalaKey ? row[kendalaKey] : null;
    const kendala =
      kendalaKey && typeof kendalaVal === "string" && kendalaVal.trim() !== ""
        ? {
            label: KEY_TO_HEADER[kendalaKey] ?? String(kendalaKey),
            text: kendalaVal,
            isIssue: !BELUM_DIISI_PATTERN.test(kendalaVal),
          }
        : undefined;

    return { group, status, indicators, kendala };
  });
}

export function countNonCompliant(compliance: CheckpointCompliance[]): number {
  return compliance.filter((c) => c.status === "belum-sesuai").length;
}
