import { getFacilRows } from "@/lib/sheet";
import { getFacilitators, getAvailableDays } from "@/lib/metrics";
import { BulkAnalysisRunner } from "@/components/BulkAnalysisRunner";

export default async function AnalisisMassalPage() {
  const rows = await getFacilRows();
  const facilitators = getFacilitators(rows).map((f) => ({ kodeFasil: f.kodeFasil, namaFasil: f.namaFasil }));
  const days = getAvailableDays(rows);

  const hfConfigured = !!process.env.HF_TOKEN;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Analisis Massal</h1>
        <p className="text-sm text-ink-secondary">
          Generate analisis AI untuk setiap fasilitator di setiap hari sekaligus ({facilitators.length} fasilitator ×{" "}
          {days.length} hari = {facilitators.length * days.length} analisis).
        </p>
      </div>
      {!hfConfigured && (
        <div className="rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          <code className="font-mono">HF_TOKEN</code> belum diset di <code className="font-mono">.env.local</code> - semua
          420 panggilan akan langsung gagal. Isi dulu tokennya sebelum menekan &quot;Generate Semua&quot;.
        </div>
      )}
      <BulkAnalysisRunner facilitators={facilitators} days={days} />
    </div>
  );
}
