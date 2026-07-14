import { CHECKPOINT_GROUPS } from "@/lib/knowledge/checkpoints";
import type { CheckpointIndicator } from "@/lib/knowledge/checkpoints";
import type { CheckpointCompliance, IndicatorCompliance } from "@/lib/compliance";
import type { CheckpointSourceData } from "@/lib/types";

type SimpleStatus = "sesuai" | "belum-sesuai" | "unknown";

const STATUS_LABEL: Record<CheckpointCompliance["status"], string> = {
  sesuai: "Sesuai",
  "belum-sesuai": "Belum sesuai",
  unknown: "Tidak ada data",
};

const STATUS_DOT: Record<SimpleStatus | "future", string> = {
  sesuai: "border-status-good bg-status-good text-white",
  "belum-sesuai": "border-status-critical bg-status-critical text-white",
  unknown: "border-status-unknown bg-status-unknown text-white",
  future: "border-dashed border-baseline bg-surface text-ink-muted",
};

const STATUS_TEXT_SM: Record<SimpleStatus, string> = {
  sesuai: "text-status-good",
  "belum-sesuai": "text-status-critical",
  unknown: "text-ink-muted",
};

const READING_TEXT_SM: Record<Reading["status"], string> = {
  ok: "text-status-good",
  violation: "text-status-critical",
  unknown: "text-ink-muted",
};

type Source = Exclude<CheckpointSourceData, null>;

const SOURCE_ORDER: Source[] = ["LK Fasil", "Aplikasi Revit"];
const SOURCE_LABEL: Record<Source, string> = { "LK Fasil": "LK", "Aplikasi Revit": "Aplikasi" };

/** Satu "bacaan" kepatuhan dari satu sumber data (LK atau Aplikasi), dinormalisasi
 * jadi skala "makin tinggi makin lengkap/baik" (0-100) supaya kedua sumber bisa
 * dibandingkan apel-ke-apel walau polaritas kolom aslinya beda-beda. */
interface Reading {
  status: "ok" | "violation" | "unknown";
  completionPct: number | null;
}

const READING_SEVERITY: Record<Reading["status"], number> = { ok: 0, unknown: 1, violation: 2 };

/** Pilih bacaan yang lebih "parah" antara dua bacaan sumber yang sama - dipakai
 * saat satu checkpoint punya beberapa indikator gating dari sumber yang sama
 * (mis. Dokumen Admin/Teknis), sesuai keputusan "tampilkan nilai gating
 * terburuk" bukan rata-rata atau tiap kolom terpisah. */
function worseReading(a: Reading, b: Reading): Reading {
  if (READING_SEVERITY[b.status] !== READING_SEVERITY[a.status]) {
    return READING_SEVERITY[b.status] > READING_SEVERITY[a.status] ? b : a;
  }
  if (a.status === "violation" && a.completionPct != null && b.completionPct != null) {
    return b.completionPct < a.completionPct ? b : a;
  }
  return a;
}

/** Completion% (0-100, "makin tinggi makin lengkap") dari satu indikator - dibaca
 * dari `ind.detail`, yang SELALU menyimpan angka mentah kalau memang ada (lihat
 * evaluateIndicator() di lib/compliance.ts: distrust hanya mengubah `status` jadi
 * "unknown", detail mentahnya tidak direset jadi "-"). Sengaja TIDAK nol-kan
 * completion cuma karena status "unknown" - nilai 0%/"Sudah" yang didowngrade
 * trustLkOkValue() tetap ada angkanya, cuma tidak dijamin akurat (ditandai warna
 * abu-abu di UI, bukan disembunyikan jadi "-"). "-" cuma untuk yang MEMANG tidak
 * ada data mentahnya sama sekali. */
function completionPct(ind: IndicatorCompliance, polarity: CheckpointIndicator["polarity"]): number | null {
  if (ind.kolom === "fasilBelumLoginLK") {
    if (ind.detail === "Sudah") return 100;
    if (ind.detail === "Belum") return 0;
    return null;
  }
  const m = ind.detail.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const raw = parseFloat(m[0]);
  return polarity === "higherIsBetter" ? raw : 100 - raw;
}

/** Kumpulkan, per checkpoint, satu bacaan terburuk untuk tiap sumber data yang
 * benar-benar ada (LK dan/atau Aplikasi) - termasuk sumber yang cuma muncul lewat
 * kolom pembanding (`counterpart`, mis. checkpoint Perencana yang Aplikasi-nya
 * bukan indikator gating tersendiri di knowledge base, cuma pembanding kolom LK). */
function buildSourceReadings(group: (typeof CHECKPOINT_GROUPS)[number], entry: CheckpointCompliance | undefined): Map<Source, Reading> {
  const readings = new Map<Source, Reading>();
  if (!entry) return readings;

  const merge = (source: Source, reading: Reading) => {
    const existing = readings.get(source);
    readings.set(source, existing ? worseReading(existing, reading) : reading);
  };

  for (const ind of entry.indicators) {
    if (!ind.gating) continue;
    const polarity = group.indicators.find((gi) => gi.kolom === ind.kolom)?.polarity;

    if (ind.sumberData) {
      merge(ind.sumberData, { status: ind.status, completionPct: completionPct(ind, polarity) });
    }

    if (ind.counterpart) {
      const counterpartSource: Source = ind.sumberData === "LK Fasil" ? "Aplikasi Revit" : "LK Fasil";
      const target = polarity === "higherIsBetter" ? 100 : 0;
      const cVal = ind.counterpart.value;
      const status: Reading["status"] = cVal == null ? "unknown" : cVal === target ? "ok" : "violation";
      const pct = cVal == null ? null : polarity === "higherIsBetter" ? cVal : 100 - cVal;
      merge(counterpartSource, { status, completionPct: pct });
    }
  }

  return readings;
}

type Row =
  | { kind: "checkpoint"; group: (typeof CHECKPOINT_GROUPS)[number] }
  | { kind: "marker"; day: number; variant: "today" | "viewed" };

/** Urutan baris: 14 checkpoint apa adanya (sudah urut per activeFromDay),
 * disisipi penanda "Hari ini"/"Sedang dilihat" tepat di posisi hari yang
 * sesuai - tanpa perlu hitung posisi piksel/persen sama sekali. */
function buildRows(todayHari: number, viewedHari: number): Row[] {
  const markers: { day: number; variant: "today" | "viewed" }[] = [{ day: todayHari, variant: "today" }];
  if (viewedHari !== todayHari) markers.push({ day: viewedHari, variant: "viewed" });
  markers.sort((a, b) => a.day - b.day);

  const rows: Row[] = [];
  let mi = 0;
  for (const g of CHECKPOINT_GROUPS) {
    while (mi < markers.length && markers[mi].day < g.activeFromDay) {
      rows.push({ kind: "marker", ...markers[mi] });
      mi++;
    }
    rows.push({ kind: "checkpoint", group: g });
  }
  while (mi < markers.length) {
    rows.push({ kind: "marker", ...markers[mi] });
    mi++;
  }
  return rows;
}

function MarkerRow({ day, variant }: { day: number; variant: "today" | "viewed" }) {
  const isToday = variant === "today";
  return (
    <div className="relative z-10 flex items-center gap-2.5 py-1">
      <div className="flex w-5 shrink-0 justify-center">
        <div className={`h-2 w-2 rounded-full ${isToday ? "bg-series-1" : "border-2 border-ink-secondary bg-surface"}`} />
      </div>
      <span className={`shrink-0 text-[10px] font-semibold ${isToday ? "text-series-1" : "text-ink-secondary"}`}>
        {isToday ? "Hari ini" : "Dilihat"} · H{day}
      </span>
      <div className={`h-px flex-1 ${isToday ? "bg-series-1/40" : "border-t border-dashed border-ink-secondary/50"}`} aria-hidden />
    </div>
  );
}

function CheckpointRow({
  group,
  entry,
}: {
  group: (typeof CHECKPOINT_GROUPS)[number];
  entry: CheckpointCompliance | undefined;
}) {
  const statusKey: CheckpointCompliance["status"] | "future" = entry ? entry.status : "future";
  const violationCount = entry?.indicators.filter((i) => i.gating && i.status === "violation").length ?? 0;
  const kendalaIssue = entry?.kendala?.isIssue;
  const readings = buildSourceReadings(group, entry);
  if (entry?.kendalaMismatch) {
    // Semua indikator kuantitatif bisa saja "ok", tapi catatan Kendala LK
    // melaporkan masalah nyata - entry.status sudah didowngrade jadi "unknown"
    // di compliance.ts, jangan biarkan bacaan per-sumber tetap bilang "Lengkap".
    // Angkanya sendiri tetap ditampilkan (cuma warnanya jadi abu-abu/unknown).
    for (const [source, r] of readings) {
      if (r.status === "ok") readings.set(source, { status: "unknown", completionPct: r.completionPct });
    }
  }
  const sources = SOURCE_ORDER.filter((s) => readings.has(s));

  return (
    <div className="relative z-10 flex items-start gap-2.5 py-1" title={group.tujuan}>
      <div className="flex w-5 shrink-0 justify-center pt-0.5">
        <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold ${STATUS_DOT[statusKey]}`}>
          {group.no}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 py-0.5 text-xs leading-tight">
        <span className="font-medium text-ink-primary">{group.name}</span>
        <span className="text-[10px] text-ink-muted">H{group.activeFromDay}·b{group.bobotTotal}</span>

        {sources.length > 0 ? (
          sources.map((s) => {
            const r = readings.get(s)!;
            const text = r.status === "ok" ? "Lengkap" : r.completionPct != null ? `${r.completionPct}%` : "-";
            return (
              <span key={s} className={`font-medium ${READING_TEXT_SM[r.status]}`}>
                {SOURCE_LABEL[s]} {text}
              </span>
            );
          })
        ) : (
          <span className={`font-medium ${entry ? STATUS_TEXT_SM[entry.status === "unknown" ? "unknown" : entry.status] : "text-ink-muted"}`}>
            {entry ? STATUS_LABEL[entry.status] : "Belum jatuh tempo"}
          </span>
        )}

        {violationCount > 0 && <span className="text-[10px] text-status-critical">({violationCount} indikator)</span>}
        {kendalaIssue && (
          <span className="rounded bg-status-critical/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-status-critical">
            ada kendala LK
          </span>
        )}
      </div>
    </div>
  );
}

export function MilestoneTimeline({
  compliance,
  todayHari,
  viewedHari,
}: {
  compliance: CheckpointCompliance[];
  todayHari: number;
  viewedHari: number;
}) {
  const rows = buildRows(todayHari, viewedHari);

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-primary">Milestone</h2>
        <span className="text-[10px] text-ink-muted">arahkan kursor ke node untuk tujuan checkpoint</span>
      </div>

      <div className="relative">
        <div className="absolute left-2.5 top-0 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-gridline" aria-hidden />
        <div className="flex flex-col">
          {rows.map((row) =>
            row.kind === "marker" ? (
              <MarkerRow key={`marker-${row.variant}`} day={row.day} variant={row.variant} />
            ) : (
              <CheckpointRow key={row.group.no} group={row.group} entry={compliance.find((c) => c.group.no === row.group.no)} />
            )
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-gridline pt-2 text-[9px] text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-good" /> Sesuai
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-critical" /> Belum sesuai
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-unknown" /> Tidak ada data
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-dashed border-baseline" /> Belum jatuh tempo
        </span>
      </div>
    </div>
  );
}
