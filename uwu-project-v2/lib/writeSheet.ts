import { getControllerEntry } from "./controller";

/**
 * Narik hasil Analisis yang SUDAH ADA di spreadsheet LK fasilitator (kolom
 * "Analisis" tabel log harian) untuk satu Hari tertentu, lewat action=get di
 * webhook Apps Script yang sama dengan pushAnalysisToSheet (lihat
 * google-apps-script/save-analisis.gs). Dipakai supaya field "Hasil Analisis"
 * di /fasilitator/[kode] ke-prefill dengan isi yang sudah ada (bisa diedit
 * lagi), bukan selalu kosong walau sudah pernah diisi/disimpan sebelumnya.
 *
 * Gagal-lunak di semua kondisi (env belum diset, fasilitator tidak ditemukan
 * di controller, webhook error/timeout) - null di semua kasus itu, field
 * cukup fallback ke kosong seperti sebelumnya, tidak boleh menggagalkan
 * render halaman.
 */
export async function fetchAnalisisFromSheet(kodeFasil: string, hari: number): Promise<string | null> {
  const url = process.env.WRITE_SHEETS_WEBHOOK_URL;
  const secret = process.env.WRITE_SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.warn(`[writeSheet] fetchAnalisisFromSheet(${kodeFasil}, Hari ${hari}): WRITE_SHEETS_WEBHOOK_URL/SECRET belum diset.`);
    return null;
  }

  const entry = await getControllerEntry(kodeFasil);
  if (!entry) {
    console.warn(`[writeSheet] fetchAnalisisFromSheet(${kodeFasil}, Hari ${hari}): kodeFasil tidak ditemukan di controller.`);
    return null;
  }

  const params = new URLSearchParams({ secret, spreadsheetId: entry.spreadsheetId, hari: String(hari), action: "get" });
  try {
    // Webhook Apps Script ini LAMBAT (SpreadsheetApp.openById + full-sheet
    // cell scan, lihat save-analisis.gs::saveAnalisisFindLogTable - terukur
    // 30+ detik di satu spreadsheet LK nyata) - di-cache 60 detik per
    // (spreadsheetId, hari) supaya pindah-pindah Hari yang sudah pernah
    // dibuka tidak menunggu round-trip itu lagi tiap kali. 60 detik (bukan
    // 300 seperti fetch lain di lib/ ini) supaya hasil Analisis yang baru
    // disimpan (pushAnalysisToSheet) tidak terlalu lama keliatan basi kalau
    // halaman di-refresh oleh admin lain.
    const res = await fetch(`${url}?${params.toString()}`, { next: { revalidate: 60 } });
    if (!res.ok) {
      console.warn(`[writeSheet] fetchAnalisisFromSheet(${kodeFasil}, Hari ${hari}): webhook HTTP ${res.status}.`);
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!data || data.error) {
      console.warn(`[writeSheet] fetchAnalisisFromSheet(${kodeFasil}, Hari ${hari}): respons webhook tidak valid/error - ${data?.error ?? JSON.stringify(data)}. Kemungkinan Apps Script belum di-redeploy dengan versi terbaru (action=get).`);
      return null;
    }
    if (typeof data.hasil !== "string") {
      console.warn(`[writeSheet] fetchAnalisisFromSheet(${kodeFasil}, Hari ${hari}): belum ada Analisis tersimpan di spreadsheet untuk Hari ini (hasil=${JSON.stringify(data.hasil)}).`);
      return null;
    }
    return data.hasil;
  } catch (err) {
    console.warn(`[writeSheet] fetchAnalisisFromSheet(${kodeFasil}, Hari ${hari}): gagal terhubung ke webhook - ${err instanceof Error ? err.message : "unknown"}.`);
    return null;
  }
}

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
