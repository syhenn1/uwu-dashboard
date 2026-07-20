import Link from "next/link";

export function DaySelector({
  days,
  current,
  basePath = "/",
  todayHari,
  extraParams,
  missingAnalysisDays,
}: {
  days: number[];
  current: number;
  basePath?: string;
  /** Kalau diisi, hari setelah ini ditandai "belum terjadi" (dari tab "Check Point"). */
  todayHari?: number;
  /** Parameter query lain yang harus dipertahankan (mis. mode=harian). */
  extraParams?: Record<string, string>;
  /** Hari yang belum punya hasil "Analisis" tersimpan di spreadsheet LK
   * fasilitator ybs (lihat lib/writeSheet.ts) - ditandai merah + "⚠", KECUALI
   * hari yang belum terjadi (wajar belum ada). undefined = statusnya belum
   * diketahui (mis. gagal fetch/belum login Google) - JANGAN ditandai sama
   * sekali daripada salah menandai semua hari. */
  missingAnalysisDays?: Set<number>;
}) {
  function hrefFor(d: number) {
    const params = new URLSearchParams({ ...extraParams, hari: String(d) });
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {days.map((d) => {
          const active = d === current;
          const future = typeof todayHari === "number" && d > todayHari;
          const missingAnalysis = !future && !!missingAnalysisDays?.has(d);
          const title = future
            ? `Hari ${d} belum terjadi (hari ini Hari ${todayHari})`
            : missingAnalysis
              ? `Hari ${d} belum ada hasil analisis tersimpan`
              : undefined;
          return (
            <Link
              key={d}
              href={hrefFor(d)}
              title={title}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active
                  ? missingAnalysis
                    ? "border-status-critical bg-status-critical text-white"
                    : "border-series-1 bg-series-1 text-white"
                  : future
                    ? "border-border text-ink-muted opacity-50 hover:opacity-80"
                    : missingAnalysis
                      ? "border-status-critical/50 bg-status-critical/10 text-status-critical hover:border-status-critical"
                      : "border-border text-ink-secondary hover:border-baseline"
              }`}
            >
              {missingAnalysis && "⚠ "}Hari {d}
            </Link>
          );
        })}
      </div>
      {typeof todayHari === "number" && (
        <p className="text-xs text-ink-muted">
          Hari ini = Hari {todayHari}. Hari yang pudar di atas belum terjadi - datanya belum tentu berarti apa-apa.
          {missingAnalysisDays && " Hari bertanda ⚠ merah belum ada hasil analisis tersimpan."}
        </p>
      )}
    </div>
  );
}
