"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FacilRow } from "@/lib/types";
import { getEffectiveRisk } from "@/lib/metrics";

const SERIES: Array<{ key: string; label: string; color: string }> = [
  { key: "nilaiRisiko", label: "Nilai Risiko", color: "var(--series-1)" },
  { key: "pctSekolahBelumLoginAplikasi", label: "% Belum Login Aplikasi", color: "var(--series-2)" },
  { key: "pctDokAdminTerunggahLengkap", label: "% Sekolah Dok. Admin Terunggah Lengkap", color: "var(--series-3)" },
  { key: "pctDokTeknisTerunggahLengkap", label: "% Sekolah Dok. Teknis Terunggah Lengkap", color: "var(--series-5)" },
];

export function TrendChart({ history }: { history: FacilRow[] }) {
  const data = history.map((r) => ({
    hari: `H${r.hari}`,
    nilaiRisiko: getEffectiveRisk(r).value,
    pctSekolahBelumLoginAplikasi: typeof r.pctSekolahBelumLoginAplikasi === "number" ? r.pctSekolahBelumLoginAplikasi : null,
    pctDokAdminTerunggahLengkap: typeof r.pctDokAdminTerunggahLengkap === "number" ? r.pctDokAdminTerunggahLengkap : null,
    pctDokTeknisTerunggahLengkap: typeof r.pctDokTeknisTerunggahLengkap === "number" ? r.pctDokTeknisTerunggahLengkap : null,
  }));
  const anyEstimated = history.some((r) => getEffectiveRisk(r).estimated);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="hari" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--ink-primary)" }}
            formatter={(value) => (value == null ? "-" : `${value}%`)}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-secondary)" }} />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {anyEstimated && (
        <p className="mt-2 text-xs text-ink-muted">
          * Nilai Risiko diestimasi dari bobot checkpoint karena kolom &quot;Nilai Risiko&quot; kosong di sheet untuk sebagian hari.
        </p>
      )}
    </div>
  );
}
