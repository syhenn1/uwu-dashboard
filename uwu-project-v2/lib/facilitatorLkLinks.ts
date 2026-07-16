import { getControllerEntry } from "./controller";

/** URL "edit" biasa - buat tombol "Buka Spreadsheet" (target=_blank). null
 * kalau fasilitator ybs belum ada di controller (lihat lib/controller.ts). */
export async function getFacilitatorLkEditUrl(kodeFasil: string): Promise<string | null> {
  const entry = await getControllerEntry(kodeFasil);
  if (!entry) return null;
  return `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/edit?gid=${entry.gid}`;
}

/** URL export CSV - buat dibaca aplikasi (fetch server-side). */
export async function getFacilitatorLkCsvUrl(kodeFasil: string): Promise<string | null> {
  const entry = await getControllerEntry(kodeFasil);
  if (!entry) return null;
  return `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/export?format=csv&gid=${entry.gid}`;
}
