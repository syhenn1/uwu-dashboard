import type { RiskLevel } from "@uwu/core/metrics";

const STYLES: Record<RiskLevel, { label: string; dot: string; text: string; bg: string }> = {
  rendah: { label: "Rendah", dot: "bg-status-good", text: "text-status-good", bg: "bg-status-good/10" },
  sedang: { label: "Sedang", dot: "bg-status-warning", text: "text-[#8a5a00] dark:text-status-warning", bg: "bg-status-warning/15" },
  tinggi: { label: "Tinggi", dot: "bg-status-critical", text: "text-status-critical", bg: "bg-status-critical/10" },
  unknown: { label: "Tidak diketahui", dot: "bg-status-unknown", text: "text-ink-muted", bg: "bg-status-unknown/10" },
};

/** `compact`: dot + label saja, TANPA angka persen (dipakai di tabel padat
 * mis. TodayLogPanel yang harus muat 1 layar tanpa scroll horizontal -
 * varian penuh dengan "· 38.1% (estimasi)" bisa jauh lebih lebar dari
 * kolomnya). Detail angka tetap ada lewat `title` (hover). */
export function RiskBadge({
  level,
  value,
  estimated,
  compact,
}: {
  level: RiskLevel;
  value: number | null;
  estimated?: boolean;
  compact?: boolean;
}) {
  const s = STYLES[level];
  const detail = typeof value === "number" ? `${value.toFixed(1)}%${estimated ? " (estimasi)" : ""}` : null;

  if (compact) {
    return (
      <span
        title={detail ? `${s.label} · ${detail}` : s.label}
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${s.bg} ${s.text}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
        {s.label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
      {detail && <span className="text-ink-muted">· {detail}</span>}
    </span>
  );
}
