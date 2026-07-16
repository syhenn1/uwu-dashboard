import { SKOR_AKHIR_COLUMNS } from "@/lib/skorAkhirColumns";
import type { FacilRow } from "@uwu/core/types";

export function RawMatriksTable({ row }: { row: FacilRow }) {
  if (!row.raw || Object.keys(row.raw).length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">
        Tabel Persentase (Sesuai Log Fasilitator)
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
        <table className="w-full text-left text-sm text-ink-secondary">
          <thead className="border-b border-border bg-background/50 text-xs uppercase text-ink-muted">
            <tr>
              <th className="sticky left-0 z-10 whitespace-nowrap bg-background/95 px-4 py-3 font-medium backdrop-blur-sm shadow-[1px_0_0_0_var(--tw-shadow-color)] shadow-border">
                Metrik
              </th>
              {SKOR_AKHIR_COLUMNS.map((col, idx) => (
                <th key={idx} className="whitespace-nowrap px-4 py-3 font-medium">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="transition-colors hover:bg-background/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface/95 px-4 py-2.5 font-medium backdrop-blur-sm shadow-[1px_0_0_0_var(--tw-shadow-color)] shadow-border">
                Nilai Terkini
              </td>
              {SKOR_AKHIR_COLUMNS.map((col, idx) => {
                const rawValue = row.raw[col.header] ?? "-";
                
                let colorClass = "text-ink-primary";
                if (typeof rawValue === "string" && rawValue.includes("%")) {
                  const num = parseFloat(rawValue);
                  if (!isNaN(num)) {
                    if (num === 100) colorClass = "text-status-good font-semibold";
                    else if (num < 50) colorClass = "text-status-critical font-semibold";
                    else if (num < 90) colorClass = "text-status-warning font-semibold";
                  }
                }

                return (
                  <td key={idx} className={`whitespace-nowrap px-4 py-2.5 ${colorClass}`}>
                    {rawValue}
                  </td>
                );
              })}
            </tr>
            <tr className="transition-colors hover:bg-background/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface/95 px-4 py-2.5 font-medium backdrop-blur-sm shadow-[1px_0_0_0_var(--tw-shadow-color)] shadow-border">
                Bobot
              </td>
              {SKOR_AKHIR_COLUMNS.map((col, idx) => (
                <td key={idx} className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                  {col.bobot}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
