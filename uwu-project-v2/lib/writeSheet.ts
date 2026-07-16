import { getControllerEntry } from "./controller";

export interface AnalysisSaveItem {
  kodeFasil: string;
  hari: number;
  hasil: string;
}

export interface WriteSheetResult {
  ok: boolean;
  updated?: number;
  notFound?: string[];
  error?: string;
}

/**
 * Push balik hasil analisis AI ke SPREADSHEET LK MASING-MASING fasilitator,
 * lewat SATU Apps Script Web App TERPUSAT (google-apps-script/save-analisis.gs,
 * dideploy SEKALI oleh admin - BUKAN 30x oleh tiap fasilitator, dikonfirmasi
 * 2026-07-16 kalau admin sudah jadi Editor di ke-30 spreadsheet LK). Pola
 * env var-nya jadi SAMA PERSIS dengan v1 (WRITE_SHEETS_WEBHOOK_URL +
 * WRITE_SHEETS_WEBHOOK_SECRET, satu-satunya) - bedanya cuma payload yang
 * dikirim menyertakan `spreadsheetId` per item (di-resolve dari
 * lib/controller.ts) supaya Apps Script tahu spreadsheet LK mana yang harus
 * dibuka & ditulis untuk tiap item.
 */
export async function pushAnalysisToSheet(items: AnalysisSaveItem[]): Promise<WriteSheetResult> {
  const url = process.env.WRITE_SHEETS_WEBHOOK_URL;
  const secret = process.env.WRITE_SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) {
    return {
      ok: false,
      error:
        "WRITE_SHEETS_WEBHOOK_URL / WRITE_SHEETS_WEBHOOK_SECRET belum diset di .env.local. Deploy dulu " +
        "google-apps-script/save-analisis.gs (lihat komentar di file itu untuk cara deploy - SEKALI saja, " +
        "standalone, tidak perlu nempel ke spreadsheet manapun), lalu isi URL & secret-nya.",
    };
  }

  const payloadItems: { spreadsheetId: string; kodeFasil: string; hari: number; hasil: string }[] = [];
  const notFound: string[] = [];
  for (const item of items) {
    const entry = await getControllerEntry(item.kodeFasil);
    if (!entry) {
      notFound.push(`${item.kodeFasil} Hari ${item.hari} (fasilitator tidak ditemukan di controller)`);
      continue;
    }
    payloadItems.push({ spreadsheetId: entry.spreadsheetId, kodeFasil: item.kodeFasil, hari: item.hari, hasil: item.hasil });
  }

  if (payloadItems.length === 0) {
    return { ok: false, error: "Tidak ada item valid untuk dikirim (semua fasilitator tidak ditemukan di controller).", notFound };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, items: payloadItems }),
    });
  } catch (err) {
    return { ok: false, error: `Gagal terhubung ke webhook Apps Script: ${err instanceof Error ? err.message : "unknown"}` };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    return { ok: false, error: data?.error || `Webhook Apps Script error ${res.status}` };
  }

  return { ok: true, updated: data.updated, notFound: [...notFound, ...(data.notFound ?? [])] };
}
