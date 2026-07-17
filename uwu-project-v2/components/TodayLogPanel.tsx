import { SKOR_AKHIR_COLUMNS, groupSkorAkhirColumns, percentCellColorClass, skorAkhirColorClass } from "@/lib/skorAkhirColumns";
import { riskLevel, getEffectiveRisk } from "@uwu/core/metrics";
import type { FacilRow } from "@uwu/core/types";
import type { DayLogSnapshot } from "@/lib/sheet";
import { RiskBadge } from "./RiskBadge";

const LABEL_CELL = "overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2 text-xs font-medium";

const HEADER_GROUPS = groupSkorAkhirColumns();

function LogRow({ label, fullLabel, row }: { label: string; fullLabel: string; row: FacilRow | null }) {
  if (!row) {
    return (
      <tr>
        <td className={LABEL_CELL} title={fullLabel}>{label}</td>
        <td colSpan={SKOR_AKHIR_COLUMNS.length + 2} className="px-2 py-2 text-xs text-ink-muted">
          Belum ada data
        </td>
      </tr>
    );
  }
  const risk = getEffectiveRisk(row);
  return (
    <tr className="transition-colors hover:bg-background/40">
      <td className={LABEL_CELL} title={fullLabel}>{label}</td>
      <td className="overflow-hidden px-1 py-2 text-center">
        <RiskBadge level={riskLevel(risk.value)} value={risk.value} estimated={risk.estimated} compact />
      </td>
      {SKOR_AKHIR_COLUMNS.map((col, idx) => {
        const rawValue = row.raw[col.header] ?? "-";
        return (
          <td
            key={idx}
            title={col.header}
            className={`overflow-hidden text-ellipsis whitespace-nowrap px-1 py-2 text-center text-xs ${percentCellColorClass(rawValue)}`}
          >
            {rawValue}
          </td>
        );
      })}
      <td
        title="Nilai Akhir"
        className={`overflow-hidden text-ellipsis whitespace-nowrap border-l border-border/60 px-1 py-2 text-center text-xs ${skorAkhirColorClass(row.skorAkhir)}`}
      >
        {typeof row.skorAkhir === "number" ? `${row.skorAkhir}%` : "-"}
      </td>
    </tr>
  );
}

/** Menampilkan snapshot Log 1 (07.00 WIB) dan Log 2 (13.30 WIB) untuk HARI
 * INI berdampingan (dua kali isi LK per hari - beda dari histori per-hari di
 * DaySelector yang cuma ambil satu, Log 2 kalau sudah diisi/fallback Log 1,
 * lihat lib/sheet.ts::fetchFacilitatorLog) supaya kelihatan progres dalam
 * satu hari, bukan cuma across hari. Sengaja satu tabel ringkas, BUKAN dua
 * FacilMetricsList penuh - supaya tidak
 * mendorong konten di bawahnya (termasuk sidebar sticky kiri/kanan) terlalu
 * jauh ke bawah. Tidak render apa-apa kalau dua-duanya belum ada data sama
 * sekali (mis. tab "Log" gagal diambil). */
export function TodayLogPanel({ todayHari, logs }: { todayHari: number; logs: DayLogSnapshot | null }) {
  if (!logs || (!logs.log1 && !logs.log2)) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">Log Hari Ini (Hari {todayHari})</h2>
      <div className="w-full rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full table-fixed text-left text-sm text-ink-secondary">
          <thead className="border-b border-border bg-background/50 text-[10px] uppercase text-ink-muted">
            <tr>
              <th rowSpan={2} className="w-16 whitespace-nowrap px-2 py-2 text-left align-bottom font-medium">
                Log
              </th>
              <th rowSpan={2} className="w-24 whitespace-nowrap px-1 py-2 text-center align-bottom font-medium">
                Risiko
              </th>
              {HEADER_GROUPS.map((g, idx) => (
                <th
                  key={idx}
                  colSpan={g.span}
                  title={`Checkpoint ${g.checkpointNo}. ${g.checkpointName} (aktif sejak Hari ${g.activeFromDay})`}
                  className="border-l border-border/60 px-1 py-1 text-center font-semibold leading-tight"
                >
                  {g.checkpointNo || "?"}
                </th>
              ))}
              <th rowSpan={2} className="w-16 whitespace-nowrap border-l border-border/60 px-1 py-2 text-center align-bottom font-medium">
                Nilai Akhir
              </th>
            </tr>
            <tr>
              {HEADER_GROUPS.flatMap((g) =>
                g.cols.map((col, i) => (
                  <th
                    key={`${g.checkpointNo}-${i}`}
                    title={col.header}
                    className="border-l border-border/60 px-1 py-1 text-center font-normal normal-case"
                  >
                    {col.short}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <LogRow label="Log 1" fullLabel="Log 1 · 07.00 WIB" row={logs.log1} />
            <LogRow label="Log 2" fullLabel="Log 2 · 13.30 WIB" row={logs.log2} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
