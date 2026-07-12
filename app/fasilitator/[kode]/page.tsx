import { notFound } from "next/navigation";
import Link from "next/link";
import { getFacilRows, getTodayHari } from "@/lib/sheet";
import { getRowsForFacilitator, riskLevel, getEffectiveRisk, getCurrentRow } from "@/lib/metrics";
import { getCheckpointCompliance, countNonCompliant } from "@/lib/compliance";
import { buildNoteRanges, formatHariRange, QUALITATIVE_FIELDS } from "@/lib/notes";
import { detectFacilitatorAnomalies } from "@/lib/anomalies";
import { DaySelector } from "@/components/DaySelector";
import { TrendChart } from "@/components/TrendChart";
import { FacilMetricsList } from "@/components/FacilMetricsList";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { RiskBadge } from "@/components/RiskBadge";
import { CheckpointCompliancePanel } from "@/components/CheckpointCompliancePanel";
import { AnomalyList } from "@/components/AnomalyList";

function hariRelativeLabel(hari: number, todayHari: number): string {
  if (hari === todayHari) return "hari ini";
  if (hari < todayHari) return "sudah lewat";
  return "belum terjadi";
}

export default async function FacilitatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kode: string }>;
  searchParams: Promise<{ hari?: string }>;
}) {
  const { kode } = await params;
  const { hari: hariParam } = await searchParams;
  const rows = await getFacilRows();
  const history = getRowsForFacilitator(rows, kode);
  if (history.length === 0) notFound();

  const days = history.map((r) => r.hari);
  const latestDay = days[days.length - 1];
  const hari = hariParam ? parseInt(hariParam, 10) : latestDay;
  const todayHari = await getTodayHari();
  const currentRow = history.find((r) => r.hari === hari) ?? getCurrentRow(history, todayHari) ?? history[history.length - 1];
  const risk = getEffectiveRisk(currentRow);
  const compliance = getCheckpointCompliance(currentRow, hari);
  const nonCompliantCount = countNonCompliant(compliance);
  const relLabel = hariRelativeLabel(hari, todayHari);

  const notes = buildNoteRanges(history, QUALITATIVE_FIELDS, (text) => text !== "Belum Diisi");
  const unfilled = buildNoteRanges(history, QUALITATIVE_FIELDS, (text) => text === "Belum Diisi");
  const anomalies = detectFacilitatorAnomalies(history, todayHari);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm text-series-1 hover:underline">
          ← Kembali ke Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">{currentRow.namaFasil}</h1>
          <RiskBadge level={riskLevel(risk.value)} value={risk.value} estimated={risk.estimated} />
          {nonCompliantCount > 0 && (
            <span className="rounded-full bg-status-critical/10 px-2.5 py-1 text-xs font-medium text-status-critical">
              ⚠ {nonCompliantCount} checkpoint belum sesuai (per Hari {hari}, {relLabel})
            </span>
          )}
        </div>
        <p className="text-sm text-ink-secondary">
          {currentRow.kodeFasil} · Koordinator: {currentRow.namaKoor} ({currentRow.kodeKoor}) · Admin: {currentRow.atmin}
        </p>
      </div>

      <DaySelector days={days} current={hari} basePath={`/fasilitator/${kode}`} todayHari={todayHari} />

      {anomalies.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Anomali Terdeteksi</h2>
          <AnomalyList items={anomalies} />
        </div>
      )}

      <TrendChart history={history} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">
          Kepatuhan Checkpoint (per Hari {hari}, {relLabel})
        </h2>
        {relLabel === "belum terjadi" && (
          <p className="mb-2 text-xs text-ink-muted">
            Hari {hari} belum terjadi (hari ini Hari {todayHari}) - ini menunjukkan checkpoint mana yang akan jatuh
            tempo per hari itu, dihitung dari data terkini (angka tidak berubah antar hari, lihat catatan di atas).
          </p>
        )}
        <CheckpointCompliancePanel compliance={compliance} todayHari={hari} />
      </div>

      <AnalysisPanel
        endpoint="/api/analyze/facilitator"
        payload={{ kodeFasil: kode, hari }}
        title={`Analisis AI - sampai Hari ${hari}`}
        buttonLabel="Buat Analisis AI"
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Detail Metrik - Hari {hari}</h2>
        <FacilMetricsList row={currentRow} />
      </div>

      {(notes.length > 0 || unfilled.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {notes.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-ink-primary">Catatan Kualitatif</h2>
              <ul className="flex flex-col gap-2">
                {notes.map((n, i) => (
                  <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm shadow-sm">
                    <span className="mr-2 rounded bg-background px-1.5 py-0.5 text-xs text-ink-muted">{formatHariRange(n)}</span>
                    <span className="font-medium text-ink-secondary">{n.label}:</span> <span className="text-ink-primary">{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unfilled.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-ink-primary">Belum Diisi Fasilitator</h2>
              <p className="mb-2 text-xs text-ink-muted">
                Kolom Kendala yang masih placeholder &ldquo;Belum Diisi&rdquo; - bagian LK yang belum ditanggapi fasilitator sama sekali. Ini juga yang jadi dasar checkpoint di atas ditandai &ldquo;Tidak ada data&rdquo;, bukan &ldquo;Sesuai&rdquo;.
              </p>
              <ul className="flex flex-col gap-1.5">
                {unfilled.map((n, i) => (
                  <li key={i} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink-muted shadow-sm">
                    <span className="mr-2 rounded bg-background px-1.5 py-0.5">{formatHariRange(n)}</span>
                    {n.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
