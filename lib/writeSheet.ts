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

function normalize(v: any) {
  return String(v == null ? "" : v).trim();
}

/** 
 * Cari tabel log harian di seluruh sheet.
 * Karena kita pakai REST API, kita ambil metadata sheet dulu lalu ambil valuesnya.
 */
async function findLogTable(spreadsheetId: string, accessToken: string) {
  // 1. Dapatkan daftar nama sheet
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 60 } // cache metadata sebentar
  });
  if (!metaRes.ok) {
    // Body error Google BIASANYA sangat spesifik (mis. "API belum diaktifkan
    // di project ..." vs "The caller does not have permission" - dua
    // penyebab 403 yang solusinya beda total) - JANGAN cuma simpan kode
    // HTTP-nya, itu tidak cukup buat didiagnosis.
    const detail = await metaRes.text().catch(() => "");
    let detailMsg = detail;
    try {
      detailMsg = JSON.parse(detail)?.error?.message ?? detail;
    } catch {
      // biarkan detailMsg = raw text kalau bukan JSON
    }
    throw new Error(`Gagal akses spreadsheet (HTTP ${metaRes.status}): ${detailMsg}`);
  }
  const metaData = await metaRes.json();
  const sheets: string[] = metaData.sheets?.map((s: any) => s.properties.title) || [];

  // 2. Fetch data dari tiap sheet secara bergiliran (atau bisa batch, tapi ini lebih aman)
  for (const sheetName of sheets) {
    const range = encodeURIComponent(`${sheetName}!A1:Z500`);
    const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });
    if (!valRes.ok) continue;
    const valData = await valRes.json();
    const values = valData.values || [];
    
    for (let r = 0; r < values.length; r++) {
      let analisisCol = -1;
      let hariCol = -1;
      for (let c = 0; c < values[r].length; c++) {
        const cell = normalize(values[r][c]);
        if (cell === "Analisis") analisisCol = c;
        if (cell.startsWith("Hari Ke")) hariCol = c;
      }
      if (analisisCol !== -1 && hariCol !== -1) {
        return { sheetName, headerRow: r, hariCol, analisisCol, values };
      }
    }
  }
  return null;
}

/** Seluruh isi kolom "Analisis" (hari -> teksnya, string kosong kalau
 * kolomnya kosong) dari tabel log SATU fasilitator - satu fetch dipakai buat
 * prefill textarea hari yang lagi dilihat SEKALIGUS status "sudah/belum ada
 * analisis" per hari (mis. buat DaySelector), jangan fetch per-hari
 * berulang-ulang cuma buat baca kolom yang sama. */
export async function fetchAnalisisTable(kodeFasil: string, accessToken?: string): Promise<Map<number, string> | null> {
  if (!accessToken) return null;
  const entry = await getControllerEntry(kodeFasil);
  if (!entry) return null;

  try {
    const found = await findLogTable(entry.spreadsheetId, accessToken);
    if (!found) return null;

    const byHari = new Map<number, string>();
    for (let r = found.headerRow + 1; r < found.values.length; r++) {
      const rowHariRaw = normalize(found.values[r][found.hariCol]);
      const rowHari = parseInt(rowHariRaw, 10);
      if (isNaN(rowHari)) continue;
      byHari.set(rowHari, normalize(found.values[r][found.analisisCol]));
    }
    return byHari;
  } catch (err) {
    console.warn(`[writeSheet] fetchAnalisisTable error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Mengonversi nomor kolom 0-based jadi huruf (misal: 0 -> A, 25 -> Z, 26 -> AA) */
function colToLetter(col: number): string {
  let temp, letter = '';
  while (col >= 0) {
    temp = col % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp) / 26 - 1;
  }
  return letter;
}

export async function pushAnalysisToSheet(items: AnalysisSaveItem[], accessToken?: string): Promise<WriteSheetResult> {
  if (!accessToken) {
    return { ok: false, error: "Kamu belum memberikan izin akses Spreadsheet pada saat login. Silakan login ulang." };
  }

  // Kelompokkan per spreadsheet
  const bySpreadsheet: Record<string, AnalysisSaveItem[]> = {};
  const notFound: string[] = [];

  for (const item of items) {
    const entry = await getControllerEntry(item.kodeFasil);
    if (!entry) {
      notFound.push(`${item.kodeFasil} Hari ${item.hari} (fasilitator tidak ditemukan)`);
      continue;
    }
    const key = entry.spreadsheetId;
    if (!bySpreadsheet[key]) bySpreadsheet[key] = [];
    bySpreadsheet[key].push(item);
  }

  let updated = 0;

  for (const spreadsheetId of Object.keys(bySpreadsheet)) {
    const groupItems = bySpreadsheet[spreadsheetId];
    const label = groupItems[0].kodeFasil || spreadsheetId;

    let found;
    try {
      found = await findLogTable(spreadsheetId, accessToken);
    } catch (err) {
      // JANGAN buang detail errornya (mis. "HTTP 403" vs "HTTP 401") - beda
      // penyebab (token tidak valid vs akun tidak punya izin ke sheet ini)
      // butuh tindak lanjut yang beda juga.
      const detail = err instanceof Error ? err.message : String(err);
      groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (gagal akses sheet: ${detail})`));
      continue;
    }

    if (!found) {
      groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (tabel log tidak ketemu)`));
      continue;
    }

    // Persiapkan batchUpdate
    const updateData = [];
    for (const item of groupItems) {
      let rowFound = false;
      for (let r = found.headerRow + 1; r < found.values.length; r++) {
        const rowHariRaw = normalize(found.values[r][found.hariCol]);
        const rowHari = parseInt(rowHariRaw, 10);
        if (!isNaN(rowHari) && rowHari === item.hari) {
          const rowNumber = r + 1;
          const colLetter = colToLetter(found.analisisCol);
          const range = `${found.sheetName}!${colLetter}${rowNumber}`;
          updateData.push({ range, values: [[item.hasil]] });
          rowFound = true;
          updated++;
          break;
        }
      }
      if (!rowFound) {
        notFound.push(`${label} Hari ${item.hari} (baris hari ke-${item.hari} tidak ketemu)`);
      }
    }

    if (updateData.length > 0) {
      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updateData,
        }),
      });
      if (!updateRes.ok) {
        groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (gagal nulis nilai)`));
      }
    }
  }

  return { ok: true, updated, notFound };
}
