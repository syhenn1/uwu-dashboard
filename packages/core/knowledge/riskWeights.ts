import { CHECKPOINT_GROUPS } from "./checkpoints";
import type { FacilRow } from "../types";

export interface RiskIndicator {
  kolom: keyof FacilRow;
  bobot: number;
  polarity?: "higherIsWorse" | "higherIsBetter";
}

/**
 * v2: beda dari v1 (yang override checkpoint No.8-13 ke bobot "asli" Min+<90%
 * karena panel status pakai indikator yang sudah disederhanakan) - skema
 * "Skor Akhir" baru cuma punya SATU set indikator per checkpoint (dipakai
 * bareng untuk status DAN Nilai Risiko), jadi tidak perlu override apa pun -
 * langsung pakai CHECKPOINT_GROUPS apa adanya.
 */
export function activeRiskIndicators(hari: number): RiskIndicator[] {
  const result: RiskIndicator[] = [];
  for (const group of CHECKPOINT_GROUPS) {
    if (group.activeFromDay > hari) continue;
    for (const ind of group.indicators) {
      result.push({ kolom: ind.kolom, bobot: ind.bobot, polarity: ind.polarity });
    }
  }
  return result;
}
