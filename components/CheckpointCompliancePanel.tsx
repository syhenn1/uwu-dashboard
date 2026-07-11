import type { CheckpointCompliance } from "@/lib/compliance";

const STATUS_STYLES = {
  sesuai: { label: "Sesuai", dot: "bg-status-good", text: "text-status-good" },
  "belum-sesuai": { label: "Belum sesuai", dot: "bg-status-critical", text: "text-status-critical" },
  unknown: { label: "Tidak ada data", dot: "bg-status-unknown", text: "text-ink-muted" },
} as const;

export function CheckpointCompliancePanel({ compliance, todayHari }: { compliance: CheckpointCompliance[]; todayHari: number }) {
  if (compliance.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-muted">
        Belum ada checkpoint yang jatuh tempo sampai Hari ke-{todayHari}.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {compliance.map(({ group, status, indicators }) => {
        const s = STATUS_STYLES[status];
        const violations = indicators.filter((i) => i.status === "violation");
        const unknowns = indicators.filter((i) => i.status === "unknown");
        return (
          <div key={group.no} className="rounded-lg border border-border bg-surface p-3">
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
              <ul className="mt-2 list-disc pl-5 text-xs text-ink-secondary">
                {violations.map((v) => (
                  <li key={v.kolom}>
                    {v.label}: <span className="font-medium text-status-critical">{v.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {unknowns.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted">
                {unknowns.map((v) => (
                  <li key={v.kolom}>
                    {v.label}: <span className="font-medium">{v.detail}</span>
                    {v.note && <span> - {v.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
