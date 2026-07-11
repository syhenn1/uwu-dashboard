"use client";

import { useMemo, useRef, useState } from "react";

interface FacilitatorRef {
  kodeFasil: string;
  namaFasil: string;
}

type ItemStatus = "pending" | "loading" | "done" | "error";

interface ResultEntry {
  kodeFasil: string;
  namaFasil: string;
  hari: number;
  status: ItemStatus;
  result?: string;
  error?: string;
}

function keyOf(kodeFasil: string, hari: number) {
  return `${kodeFasil}__${hari}`;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

export function BulkAnalysisRunner({ facilitators, days }: { facilitators: FacilitatorRef[]; days: number[] }) {
  const combos = useMemo(
    () => facilitators.flatMap((f) => days.map((hari) => ({ ...f, hari }))),
    [facilitators, days]
  );

  const [entries, setEntries] = useState<Record<string, ResultEntry>>({});
  const [concurrency, setConcurrency] = useState(4);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const list = combos.map((c) => entries[keyOf(c.kodeFasil, c.hari)]).filter((e): e is ResultEntry => !!e);
  const doneCount = list.filter((e) => e.status === "done").length;
  const errorCount = list.filter((e) => e.status === "error").length;
  const totalStarted = list.length;
  const total = combos.length;
  const pct = total ? Math.round(((doneCount + errorCount) / total) * 100) : 0;

  async function generateOne(item: FacilitatorRef & { hari: number }) {
    const key = keyOf(item.kodeFasil, item.hari);
    setEntries((prev) => ({
      ...prev,
      [key]: { kodeFasil: item.kodeFasil, namaFasil: item.namaFasil, hari: item.hari, status: "loading" },
    }));
    try {
      const res = await fetch("/api/analyze/facilitator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kodeFasil: item.kodeFasil, hari: item.hari }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat analisis.");
      setEntries((prev) => ({
        ...prev,
        [key]: { kodeFasil: item.kodeFasil, namaFasil: item.namaFasil, hari: item.hari, status: "done", result: data.result },
      }));
    } catch (err) {
      setEntries((prev) => ({
        ...prev,
        [key]: {
          kodeFasil: item.kodeFasil,
          namaFasil: item.namaFasil,
          hari: item.hari,
          status: "error",
          error: err instanceof Error ? err.message : "Gagal.",
        },
      }));
    }
  }

  async function startAll(onlyFailed = false) {
    setRunning(true);
    cancelRef.current = false;
    const queue = onlyFailed ? list.filter((e) => e.status === "error").map((e) => ({ kodeFasil: e.kodeFasil, namaFasil: e.namaFasil, hari: e.hari })) : combos;
    await runWithConcurrency(queue, concurrency, async (item) => {
      if (cancelRef.current) return;
      await generateOne(item);
    });
    setRunning(false);
  }

  function stop() {
    cancelRef.current = true;
    setRunning(false);
  }

  function exportJson() {
    download(
      "analisis-massal.json",
      JSON.stringify(
        combos.map((c) => entries[keyOf(c.kodeFasil, c.hari)] ?? { ...c, status: "pending" }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportMarkdown() {
    const parts = combos.map((c) => {
      const e = entries[keyOf(c.kodeFasil, c.hari)];
      const body = e?.status === "done" ? e.result : e?.status === "error" ? `_Gagal: ${e.error}_` : "_Belum digenerate._";
      return `# ${c.namaFasil} (${c.kodeFasil}) - Hari ${c.hari}\n\n${body}\n`;
    });
    download("analisis-massal.md", parts.join("\n---\n\n"), "text/markdown");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-sm text-ink-secondary">
          Ini akan memanggil model AI sebanyak <strong>{total}x</strong> ({facilitators.length} fasilitator ×{" "}
          {days.length} hari). Bisa memakan waktu cukup lama dan menggunakan kuota API Hugging Face Anda. Setiap
          kombinasi fasilitator+hari punya data berbeda (checkpoint yang berlaku & catatan kualitatif per hari),
          jadi hasilnya seharusnya berbeda satu sama lain - meskipun untuk fasilitator yang sama, beberapa hari
          bisa terdengar mirip kalau metrik angkanya memang belum berubah di sheet.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            Paralel:
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              disabled={running}
              className="rounded border border-border bg-background px-2 py-1"
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => startAll(false)}
            disabled={running}
            className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Sedang generate..." : totalStarted > 0 ? "Generate Ulang Semua" : `Generate Semua (${total})`}
          </button>
          {running && (
            <button onClick={stop} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
              Hentikan
            </button>
          )}
          {!running && errorCount > 0 && (
            <button
              onClick={() => startAll(true)}
              className="rounded-md border border-status-critical/40 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              Coba Ulang yang Gagal ({errorCount})
            </button>
          )}
          {doneCount > 0 && (
            <>
              <button onClick={exportJson} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                Unduh JSON
              </button>
              <button onClick={exportMarkdown} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                Unduh Markdown
              </button>
            </>
          )}
        </div>

        {totalStarted > 0 && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full bg-series-1 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {doneCount} selesai, {errorCount} gagal, dari {total} ({pct}%)
            </p>
          </div>
        )}
      </div>

      {totalStarted > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-ink-secondary">
                <th className="px-3 py-2">Fasilitator</th>
                <th className="px-3 py-2">Hari</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ringkasan</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => {
                const key = keyOf(c.kodeFasil, c.hari);
                const e = entries[key];
                if (!e) return null;
                const isOpen = expanded === key;
                return (
                  <tr key={key} className="cursor-pointer border-b border-gridline last:border-0 hover:bg-background" onClick={() => setExpanded(isOpen ? null : key)}>
                    <td className="px-3 py-2">
                      {c.namaFasil}
                      <div className="text-xs text-ink-muted">{c.kodeFasil}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-secondary">Hari {c.hari}</td>
                    <td className="px-3 py-2">
                      {e.status === "loading" && <span className="text-ink-muted">Memproses...</span>}
                      {e.status === "pending" && <span className="text-ink-muted">Menunggu</span>}
                      {e.status === "done" && <span className="text-status-good">Selesai</span>}
                      {e.status === "error" && <span className="text-status-critical">Gagal</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {e.status === "done" && (
                        <div className={isOpen ? "" : "line-clamp-1"}>{e.result}</div>
                      )}
                      {e.status === "error" && <span className="text-status-critical">{e.error}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
