/** Skeleton instan yang tampil begitu link "Sebelumnya"/"Selanjutnya" (atau
 * link fasilitator manapun) diklik, SEBELUM data hari itu (rows, compliance,
 * tabel Analisis dari spreadsheet LK Log pribadi, dll di page.tsx) selesai
 * di-fetch - Next.js otomatis nampilin file ini lewat Suspense boundary per
 * route segment, jadi transisi terasa instan walau data sebenarnya masih
 * nyusul di belakang. */
function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-border/60 ${className ?? ""}`} />;
}

export default function FacilitatorDetailLoading() {
  return (
    <div className="-mx-6 -my-6 px-4 py-3 sm:px-6 lg:h-[calc(100vh-53px)] lg:px-8 lg:py-3">
      <div className="flex h-full flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Pulse className="h-4 w-32" />
            <Pulse className="h-6 w-56" />
            <Pulse className="h-4 w-72" />
          </div>
          <Pulse className="h-8 w-40" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Pulse key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <Pulse className="min-h-[200px]" />
          <Pulse className="min-h-[200px]" />
        </div>
      </div>
    </div>
  );
}
