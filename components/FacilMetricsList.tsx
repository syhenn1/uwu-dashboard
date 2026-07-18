import { activeCheckpoints } from "@uwu/core/knowledge/checkpoints";
import { KEY_TO_HEADER } from "@uwu/core/columns";
import type { FacilRow } from "@uwu/core/types";
import { InfoTooltip } from "./InfoTooltip";

function formatValue(v: FacilRow[keyof FacilRow]): string {
  if (v == null) return "-";
  if (typeof v === "number") return `${v}%`;
  return String(v);
}

export function FacilMetricsList({ row, overrideHari }: { row: FacilRow; overrideHari?: number }) {
  const groups = activeCheckpoints(overrideHari ?? row.hari);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <div key={group.no} className="rounded-lg border border-border bg-surface p-3.5 shadow-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold text-ink-primary">
              {group.no}. {group.name}
            </h4>
            <span className="text-xs text-ink-muted">bobot {group.bobotTotal}</span>
          </div>
          <dl className="flex flex-col gap-1.5">
            {group.indicators.map((ind) => (
              <div key={ind.kolom} className="flex items-center justify-between gap-2 text-xs">
                <dt className="flex items-center text-ink-secondary">
                  {KEY_TO_HEADER[ind.kolom] ?? ind.kolom}
                  <InfoTooltip text={`${ind.definisi} (sumber: ${ind.sumberData ?? "-"})`} />
                </dt>
                <dd className="shrink-0 tabular-nums font-medium text-ink-primary">{formatValue(row[ind.kolom])}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
