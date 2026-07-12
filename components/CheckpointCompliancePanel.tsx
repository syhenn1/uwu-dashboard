import type { CheckpointCompliance, IndicatorCompliance } from "@/lib/compliance";

const STATUS_STYLES = {
  sesuai: { label: "Sesuai", dot: "bg-status-good", text: "text-status-good" },
  "belum-sesuai": { label: "Belum sesuai", dot: "bg-status-critical", text: "text-status-critical" },
  unknown: { label: "Tidak ada data", dot: "bg-status-unknown", text: "text-ink-muted" },
} as const;

function SourceTag({ source }: { source: IndicatorCompliance["sumberData"] }) {
  if (!source) return null;
  const isLk = source === "LK Fasil";
  return (
    <span
      className={`mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isLk ? "bg-series-5/10 text-series-5" : "bg-series-1/10 text-series-1"
      }`}
    >
      {isLk ? "LK" : "Aplikasi"}
    </span>
  );
}

/** Menampilkan nilai LK dan Aplikasi berdampingan kalau indikator ini punya
 * pasangan sungguhan di kolom lain - supaya tidak cuma satu sisi yang terlihat. */
function ComparisonNote({ ind }: { ind: IndicatorCompliance }) {
  if (!ind.counterpart) return null;
  const { counterpart } = ind;
  const lk = ind.sumberData === "LK Fasil" ? ind.detail : counterpart.value != null ? `${counterpart.value}%` : "-";
  const aplikasi = ind.sumberData === "Aplikasi Revit" ? ind.detail : counterpart.value != null ? `${counterpart.value}%` : "-";
  return (
    <span className="text-ink-muted">
      {" "}
      (Hasil LK: <span className="font-medium text-ink-secondary">{lk}</span> · Aplikasi:{" "}
      <span className="font-medium text-ink-secondary">{aplikasi}</span>
      {counterpart.selisih != null && !counterpart.konsisten && (
        <span className="font-medium text-status-warning"> · selisih {counterpart.selisih} poin ⚠</span>
      )}
      )
    </span>
  );
}

export function CheckpointCompliancePanel({ compliance, todayHari }: { compliance: CheckpointCompliance[]; todayHari: number }) {
  if (compliance.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-muted">
        Belum ada checkpoint yang jatuh tempo sampai Hari ke-{todayHari}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {compliance.map(({ group, status, indicators, kendala }) => {
        const s = STATUS_STYLES[status];
        const violations = indicators.filter((i) => i.gating && i.status === "violation");
        const unknowns = indicators.filter((i) => i.gating && i.status === "unknown");
        const info = indicators.filter((i) => !i.gating);
        return (
          <div key={group.no} className="flex flex-col rounded-xl border border-border bg-surface p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-primary">
                {group.no}. {group.name}
                <span className="ml-2 text-xs font-normal text-ink-muted">jatuh tempo Hari {group.activeFromDay}</span>
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
                {s.label}
              </span>
            </div>

            {violations.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 text-xs text-ink-secondary">
                {violations.map((v) => (
                  <li key={v.kolom} className="flex items-start gap-1.5">
                    <SourceTag source={v.sumberData} />
                    <span>
                      {v.label}: <span className="font-medium text-status-critical">{v.detail}</span>
                      <ComparisonNote ind={v} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {unknowns.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 text-xs text-ink-muted">
                {unknowns.map((v) => (
                  <li key={v.kolom} className="flex items-start gap-1.5">
                    <SourceTag source={v.sumberData} />
                    <span>
                      {v.label}: <span className="font-medium">{v.detail}</span>
                      {v.note && <span> - {v.note}</span>}
                      <ComparisonNote ind={v} />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {info.length > 0 && (
              <div className="mt-2 border-t border-gridline pt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Info &amp; pembanding</p>
                <ul className="flex flex-col gap-1.5 text-xs text-ink-secondary">
                  {info.map((v) => (
                    <li key={v.kolom} className="flex items-start gap-1.5">
                      <SourceTag source={v.sumberData} />
                      <span>
                        {v.label}: <span className="font-medium text-ink-primary">{v.detail}</span>
                        <ComparisonNote ind={v} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {kendala && (
              <div className="mt-2 rounded-md bg-background px-2.5 py-2 text-xs text-ink-secondary">
                <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-ink-muted">{kendala.label} (LK)</span>
                  {kendala.isIssue && (
                    <span className="rounded-full bg-status-critical/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-critical">
                      tersirat: Belum
                    </span>
                  )}
                </div>
                {kendala.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
