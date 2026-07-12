import Link from "next/link";

export function ModeToggle({ mode }: { mode: "alltime" | "harian" }) {
  const tab = (value: "alltime" | "harian", label: string) => {
    const active = mode === value;
    return (
      <Link
        href={`/?mode=${value}`}
        className={`rounded-full px-3 py-1 text-sm transition-colors ${
          active ? "bg-series-1 text-white" : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="inline-flex gap-0.5 rounded-full border border-border bg-surface p-0.5">
      {tab("alltime", "Semua Waktu")}
      {tab("harian", "Per Hari")}
    </div>
  );
}
