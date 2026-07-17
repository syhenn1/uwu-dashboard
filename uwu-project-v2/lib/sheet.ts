import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import { COLUMN_MAP, toFacilRow } from "@uwu/core/columns";
import type { FacilRow } from "@uwu/core/types";
import { isControllerConfigured, getControllerEntries } from "./controller";
import type { ControllerFacilitatorEntry } from "./controller";
import { SKOR_AKHIR_COLUMNS, applySkorAkhirColumns, parsePercentCell } from "./skorAkhirColumns";

const HEADER_ANCHOR = `${COLUMN_MAP[0].header},`; // "Atmin,"

/** Data contoh (2 fasilitator fiktif, 14 hari, sintetis) - dipakai persis
 * seperti v1 tanpa SHEET_CSV_URL, supaya `npm install && npm run dev` di v2
 * langsung jalan tanpa konfigurasi apa pun. Sengaja pakai fixture CSV yang
 * SAMA formatnya dengan v1 (bukan format LK Fasil mentah) - ini cuma demo
 * shape data, bukan simulasi sumber data v2 yang sesungguhnya. */
async function loadSampleRows(): Promise<FacilRow[]> {
  const fixturePath = path.join(process.cwd(), "fixtures", "sample-sheet.csv");
  const raw = await fs.readFile(fixturePath, "utf8");
  const lines = raw.split(/\r\n|\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith(HEADER_ANCHOR));
  const csv = headerIdx === -1 ? raw : lines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return parsed.data.filter((r) => (r["Kode Fasil"] ?? "").trim() !== "").map(toFacilRow);
}

export function isUsingSampleData(): boolean {
  return !isControllerConfigured();
}

/**
 * Nama tab berisi Skor Akhir TERKINI (satu baris) di dalam SETIAP spreadsheet
 * LK pribadi fasilitator - DIKONFIRMASI 2026-07-16: nama tabnya "Isian" (label
 * "Matriks" yang dipakai di komentar lain di file ini cuma teks di salah satu
 * sel, BUKAN nama tab). Dicari lewat NAMA (Google Visualization API,
 * `/gviz/tq?sheet=Isian`) - lebih tahan banting daripada gid, karena nama tab
 * biasanya tetap konsisten walau gid auto-generate bisa beda per salinan.
 */
const ISIAN_SHEET_NAME = "Isian";

/** Fallback gid kalau fetch by-name gagal (mis. penamaan tab beda-beda tipis
 * antar fasilitator) - DIKONFIRMASI di SATU contoh nyata (LK "Ade Kurniawan
 * Anshar"/PNUP-Fasil-64: gid=447897018). Override lewat env var MATRIKS_GID
 * kalau perlu. */
const MATRIKS_GID = process.env.MATRIKS_GID || "447897018";

function blankFacilRow(): FacilRow {
  return {
    atmin: "", hari: 0, hariLabel: "", kodeFasil: "", namaFasil: "", kodeKoor: "", namaKoor: "",
    fasilBelumLoginLK: null,
    pctSekolahBelumDihubungi: null,
    pctSekolahBelumLoginAplikasi: null,
    frekuensiKomunikasi: null,
    pctTidakPunyaPanlak: null,
    pctTidakPunyaFormatTemplate: null,
    pctBiodataBelumTerverifikasi: null,
    pctTidakPunyaPerencanaLK: null,
    pctTidakPunyaPerencanaAplikasi: null,
    pctDapodikTidakSesuaiBelumUpdate: null,
    pctSudahUpdateDapodik: null,
    pctSudahUploadBuktiUpdateDapodik: null,
    penyusunanDokAdminTerkendala: null,
    pctDokAdminTerunggahLengkap: null,
    rataDokAdminTerunggah: null,
    minDokAdminTerunggah: null,
    pctDokAdminTerunggahDibawah90: null,
    pctDokAdminTerverifikasi: null,
    rataDokAdminTerverifikasi: null,
    minDokAdminTerverifikasi: null,
    pctDokAdminTerverifikasiDibawah90: null,
    pctDokAdminSesuai: null,
    rataDokAdminSesuai: null,
    minDokAdminSesuai: null,
    pctDokAdminSesuaiDibawah90: null,
    penyusunanDokTeknisTerkendala: null,
    pctDokTeknisTerunggahLengkap: null,
    rataDokTeknisTerunggah: null,
    minDokTeknisTerunggah: null,
    pctDokTeknisTerunggahDibawah90: null,
    pctDokTeknisTerverifikasi: null,
    rataDokTeknisTerverifikasi: null,
    minDokTeknisTerverifikasi: null,
    pctDokTeknisTerverifikasiDibawah90: null,
    pctDokTeknisSesuai: null,
    rataDokTeknisSesuai: null,
    minDokTeknisSesuai: null,
    pctDokTeknisSesuaiDibawah90: null,
    pctBelumSepakatRAB: null,
    nilaiRisiko: null,
    kendalaKomunikasi: null,
    kendalaPanlakFormatTemplate: null,
    kendalaMendapatkanPerencana: null,
    kendalaVerifikasiBiodata: null,
    kendalaUpdateDapodik: null,
    kendalaPenyusunanDokAdmin: null,
    kendalaVerifikasiDokAdmin: null,
    kendalaPenyusunanDokTeknis: null,
    kendalaVerifikasiDokTeknis: null,
    kendalaPenyepakatanRAB: null,
    analisis: null,
    catatanAdmin: null,
    skorAkhir: null,
    raw: {},
  };
}

/**
 * Parses tab "Isian" (label "Matriks" di salah satu selnya) satu fasilitator -
 * DIKONFIRMASI 2026-07-16 (contoh nyata "Ade Kurniawan Anshar"): beberapa
 * baris label/dropdown di atas
 * ("Pilih Nama Fasilitator", "Hari ke", baris bobot 2/2/2/.../12), baris
 * header sebenarnya diawali "Atmin" (kolom: Atmin, Hari Ke -, Kode Fasil,
 * Nama Fasil, Kode Koor, Nama Koor, lalu 26 kolom Skor Akhir - lihat
 * lib/skorAkhirColumns.ts), TEPAT SATU baris data setelah header (cuma
 * snapshot HARI INI, bukan histori 14 hari seperti "Level Fasil" v1 - lihat
 * catatan di README.md soal implikasinya), lalu kolom ke-27 (tanpa nama
 * header, sel kosong di baris header) berisi angka "Skor Akhir" total.
 * Dipakai header:false (bukan header:true) karena kolom terakhir itu TIDAK
 * punya nama header sama sekali - Papa.parse(header:true) akan
 * memperlakukan itu tidak konsisten antar versi/baris. */
function parseMatriksCsv(csv: string): { identity: string[]; values: string[]; skorAkhirRaw: string } | null {
  const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false });
  const rows = parsed.data;
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim() === "Atmin");
  if (headerIdx === -1) return null;
  const dataRow = rows[headerIdx + 1];
  if (!dataRow || (dataRow[2] ?? "").trim() === "") return null; // kolom C = Kode Fasil kosong = bukan baris data
  return {
    identity: dataRow.slice(0, 6),
    values: dataRow.slice(6, 6 + SKOR_AKHIR_COLUMNS.length),
    skorAkhirRaw: dataRow[6 + SKOR_AKHIR_COLUMNS.length] ?? "",
  };
}

/** Fetch satu CSV, mengembalikan text-nya kalau HTTP 200, null kalau gagal
 * (fetch error ATAU status non-200) - dipakai fetchFacilitatorMatriks() untuk
 * coba nama tab dulu, baru fallback ke gid. */
async function tryFetchCsv(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseLogCsv(csv: string): { values: string[] } | null {
  const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false });
  const rows = parsed.data;
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim() === "Atmin");
  if (headerIdx === -1) return null;
  
  let lastDataRow = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    if ((rows[i][2] ?? "").trim() !== "") {
      lastDataRow = rows[i];
    }
  }
  
  if (!lastDataRow) return null;
  
  return {
    values: lastDataRow.slice(6, 6 + SKOR_AKHIR_COLUMNS.length),
  };
}

/** Fetch + parse tab "Isian" (untuk Skor Akhir) dan "Log" (untuk data mentah).
 * Coba by-name dulu (ISIAN_SHEET_NAME), fallback ke gid (MATRIKS_GID) kalau
 * itu gagal. null kalau dua-duanya gagal (dicatat via console.warn, TIDAK
 * throw - satu fasilitator gagal tidak boleh menggagalkan semua). */
async function fetchFacilitatorMatriks(entry: ControllerFacilitatorEntry): Promise<FacilRow | null> {
  const byNameUrl = `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/gviz/tq?${new URLSearchParams({ tqx: "out:csv", sheet: ISIAN_SHEET_NAME }).toString()}`;
  const byGidUrl = `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/export?format=csv&gid=${MATRIKS_GID}`;

  let csvIsian = await tryFetchCsv(byNameUrl);
  let matriksIsian = csvIsian ? parseMatriksCsv(csvIsian) : null;
  if (!matriksIsian) {
    csvIsian = await tryFetchCsv(byGidUrl);
    matriksIsian = csvIsian ? parseMatriksCsv(csvIsian) : null;
  }
  if (!matriksIsian) {
    console.warn(`[sheet] Tab "${ISIAN_SHEET_NAME}" (atau gid=${MATRIKS_GID} fallback) tidak bisa diakses/di-parse untuk ${entry.kodeFasil} - kemungkinan sheet belum di-share publik, atau nama/gid tab beda di sheet ini.`);
    return null;
  }
  
  const logUrl = `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/gviz/tq?${new URLSearchParams({ tqx: "out:csv", sheet: "Log" }).toString()}`;
  const csvLog = await tryFetchCsv(logUrl);
  const matriksLog = csvLog ? parseLogCsv(csvLog) : null;

  const [atmin, hariKeRaw, kodeFasil, namaFasil, kodeKoor, namaKoor] = matriksIsian.identity;
  const hari = parseInt((hariKeRaw ?? "").trim(), 10) || 0;
  const skorAkhir = parsePercentCell(matriksIsian.skorAkhirRaw);

  const row = blankFacilRow();
  row.atmin = (atmin ?? "").trim() || entry.atmin;
  row.hari = hari;
  row.hariLabel = `Hari ${hari}`;
  row.kodeFasil = (kodeFasil ?? "").trim() || entry.kodeFasil;
  row.namaFasil = (namaFasil ?? "").trim() || entry.namaFasil;
  row.kodeKoor = (kodeKoor ?? "").trim();
  row.namaKoor = (namaKoor ?? "").trim();
  if (skorAkhir != null) {
    row.skorAkhir = skorAkhir;
  }

  const rawValues = matriksLog ? matriksLog.values : matriksIsian.values;

  const rawRecord: Record<string, string> = {};
  SKOR_AKHIR_COLUMNS.forEach((col, i) => {
    rawRecord[col.header] = rawValues[i] ?? "";
  });
  row.raw = rawRecord;
  Object.assign(row, applySkorAkhirColumns(rawRecord));

  return row;
}

// --- Tab "Log" (histori multi-hari + snapshot Log 1/Log 2 per hari) -----

/**
 * Nama tab berisi HISTORI multi-hari (beda dari "Isian"/"Matriks" yang cuma
 * snapshot HARI INI) di dalam SETIAP spreadsheet LK pribadi fasilitator -
 * DIKONFIRMASI 2026-07-17 lewat fetch langsung: dua baris per hari ("Log 1
 * di 07.00 WIB" dan "Log 2 di 13.30 WIB"), kolom sama seperti tab "Isian"
 * (Kode Fasil, Nama Fasil, Kode Koor, Nama Koor, lalu 26 kolom Skor Akhir +
 * total) TAPI kolom pertamanya label Log (bukan Atmin) dan kolom kedua sudah
 * berupa angka "Hari" mentah (bukan label "Hari Ke -"). Baris untuk hari yang
 * belum terjadi/belum diisi tetap ADA tapi kosong (Kode Fasil dkk. blank) -
 * itu ditandai sebagai "belum ada data", bukan ikut jadi baris histori.
 */
const LOG_SHEET_NAME = "Log";

interface ParsedLogRow {
  hari: number;
  logNumber: number;
  identity: string[]; // [kodeFasil, namaFasil, kodeKoor, namaKoor]
  values: string[];
  skorAkhirRaw: string;
}

/** Parses satu baris data tab "Log" (Papa.parse header:false, array kolom
 * mentah) - null kalau bukan baris log yang valid (kolom pertama bukan
 * "Log N di ...", atau kolom "Hari" bukan angka). */
function parseLogRow(cols: string[]): ParsedLogRow | null {
  const label = (cols[0] ?? "").trim();
  const logMatch = label.match(/^Log\s*(\d+)/i);
  if (!logMatch) return null;
  const hari = parseInt((cols[1] ?? "").trim(), 10);
  if (!hari) return null;
  return {
    hari,
    logNumber: parseInt(logMatch[1], 10),
    identity: cols.slice(2, 6),
    values: cols.slice(6, 6 + SKOR_AKHIR_COLUMNS.length),
    skorAkhirRaw: cols[6 + SKOR_AKHIR_COLUMNS.length] ?? "",
  };
}

/** Bangun FacilRow dari satu ParsedLogRow - pola sama persis dengan bagian
 * akhir fetchFacilitatorMatriks di atas, cuma identity-nya beda urutan/isi
 * (tidak ada "Atmin"/"Hari Ke -" per baris di tab "Log", jadi atmin & hari
 * diambil dari entry controller + kolom "Hari" tab Log). */
function buildFacilRowFromLog(entry: ControllerFacilitatorEntry, parsed: ParsedLogRow): FacilRow {
  const [kodeFasil, namaFasil, kodeKoor, namaKoor] = parsed.identity;
  const skorAkhir = parsePercentCell(parsed.skorAkhirRaw);

  const row = blankFacilRow();
  row.atmin = entry.atmin;
  row.hari = parsed.hari;
  row.hariLabel = `Hari ${parsed.hari}`;
  row.kodeFasil = (kodeFasil ?? "").trim() || entry.kodeFasil;
  row.namaFasil = (namaFasil ?? "").trim() || entry.namaFasil;
  row.kodeKoor = (kodeKoor ?? "").trim();
  row.namaKoor = (namaKoor ?? "").trim();
  if (skorAkhir != null) {
    row.nilaiRisiko = 100 - skorAkhir;
    row.skorAkhir = skorAkhir;
  }

  const rawRecord: Record<string, string> = {};
  SKOR_AKHIR_COLUMNS.forEach((col, i) => {
    rawRecord[col.header] = parsed.values[i] ?? "";
  });
  row.raw = rawRecord;
  Object.assign(row, applySkorAkhirColumns(rawRecord));

  return row;
}

export interface DayLogSnapshot {
  log1: FacilRow | null;
  log2: FacilRow | null;
}

export interface FacilitatorLogData {
  /** Satu FacilRow per hari yang SUDAH ada datanya (Log 2 kalau sudah diisi,
   * fallback ke Log 1 kalau Log 2 belum) - dipakai sebagai histori multi-hari
   * di halaman /fasilitator/[kode] (DaySelector dkk.), diurutkan naik. */
  history: FacilRow[];
  /** Snapshot Log 1 & Log 2 MENTAH per hari (tanpa digabung) - dipakai untuk
   * menampilkan keduanya berdampingan, terutama untuk hari ini. */
  logsByHari: Map<number, DayLogSnapshot>;
}

/** Fetch + parse tab "Log" satu fasilitator (histori multi-hari + Log 1/Log 2
 * per hari) - null kalau tab-nya tidak ada/tidak bisa diakses (dicatat via
 * console.warn, TIDAK throw, sama seperti fetchFacilitatorMatriks: satu
 * fasilitator gagal tidak boleh menggagalkan halaman). */
async function fetchFacilitatorLog(entry: ControllerFacilitatorEntry): Promise<FacilitatorLogData | null> {
  const url = `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/gviz/tq?${new URLSearchParams({ tqx: "out:csv", sheet: LOG_SHEET_NAME }).toString()}`;
  const csv = await tryFetchCsv(url);
  if (!csv) {
    console.warn(`[sheet] Tab "${LOG_SHEET_NAME}" tidak bisa diakses/di-parse untuk ${entry.kodeFasil}.`);
    return null;
  }

  const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false });
  const rows = parsed.data;
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim() === "Log");
  if (headerIdx === -1) {
    console.warn(`[sheet] Baris header tab "${LOG_SHEET_NAME}" (kolom pertama "Log") tidak ditemukan untuk ${entry.kodeFasil}.`);
    return null;
  }

  const logsByHari = new Map<number, DayLogSnapshot>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const parsedRow = parseLogRow(rows[i]);
    if (!parsedRow) continue;
    if ((rows[i][2] ?? "").trim() === "") continue; // kolom C = Kode Fasil kosong = belum ada data log ini
    const facilRow = buildFacilRowFromLog(entry, parsedRow);
    const slot = logsByHari.get(parsedRow.hari) ?? { log1: null, log2: null };
    if (parsedRow.logNumber === 1) slot.log1 = facilRow;
    else if (parsedRow.logNumber === 2) slot.log2 = facilRow;
    logsByHari.set(parsedRow.hari, slot);
  }

  const history: FacilRow[] = [];
  const haris = Array.from(logsByHari.keys()).sort((a, b) => a - b);
  for (const hari of haris) {
    const slot = logsByHari.get(hari)!;
    const chosen = slot.log2 ?? slot.log1;
    if (chosen) history.push(chosen);
  }

  return { history, logsByHari };
}

/**
 * Histori multi-hari + snapshot Log 1/Log 2 SATU fasilitator, dari tab "Log"
 * di spreadsheet LK pribadinya - lihat catatan LOG_SHEET_NAME di atas.
 * Dipakai KHUSUS di halaman /fasilitator/[kode] (bukan getFacilRows), supaya
 * DaySelector bisa menampilkan semua hari yang datanya sudah ada (bukan cuma
 * 1 hari terkini seperti tab "Isian"). null kalau kodeFasil tidak ditemukan
 * di controller ATAU fetch tab "Log"-nya gagal total - pemanggil harus
 * fallback ke histori 1-baris dari getFacilRows() seperti sebelumnya.
 */
export async function getFacilitatorLogData(kodeFasil: string): Promise<FacilitatorLogData | null> {
  const entries = await getControllerEntries();
  const entry = entries.find((e) => e.kodeFasil === kodeFasil);
  if (!entry) return null;
  return fetchFacilitatorLog(entry);
}

/**
 * Sumber data ASLI v2: satu FacilRow (kondisi TERKINI, bukan histori) per
 * fasilitator, di-fetch paralel dari tab "Matriks" masing-masing 30
 * spreadsheet LK (lihat fetchFacilitatorMatriks). SELALU fallback ke data
 * contoh kalau: controller belum dikonfigurasi, ATAU fetch real-nya gagal
 * total (0 baris berhasil) - supaya dashboard tidak pernah kosong total.
 * Fetch PARSIAL (mis. 25 dari 30 berhasil) TETAP dipakai apa adanya (bukan
 * fallback ke sample) - fasilitator yang gagal tercatat di log server
 * (lihat fetchFacilitatorMatriks), sisanya tetap data asli.
 *
 * KETERBATASAN (lihat README.md): tab "Matriks"/"Isian" cuma expose kondisi
 * HARI INI, bukan histori multi-hari - jadi `getFacilRows()` mengembalikan
 * HANYA 1 baris per fasilitator. TERNYATA ada sumber histori terpisah, tab
 * "Log" (dikonfirmasi 2026-07-17, lihat getFacilitatorLogData di bawah) -
 * dipakai KHUSUS di halaman /fasilitator/[kode] (histori per-hari + snapshot
 * Log 1/Log 2 hari ini), belum dipakai di sini (getFacilRows tetap 1
 * baris/fasilitator) supaya dashboard/perbandingan yang butuh SATU baris
 * "kondisi terkini" per fasilitator tidak perlu diubah sekaligus.
 */
let facilRowsCache: { at: number; rows: FacilRow[] } | null = null;
const FACIL_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getFacilRows(): Promise<FacilRow[]> {
  if (facilRowsCache && Date.now() - facilRowsCache.at < FACIL_CACHE_TTL_MS) {
    return facilRowsCache.rows;
  }

  if (!isControllerConfigured()) return loadSampleRows();

  const entries = await getControllerEntries();
  if (entries.length === 0) {
    console.warn("[sheet] Controller tidak mengembalikan fasilitator apa pun - masih memakai data contoh.");
    return loadSampleRows();
  }

  const results: (FacilRow | null)[] = [];
  const BATCH_SIZE = 5;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(fetchFacilitatorMatriks));
    results.push(...batchResults);
    if (i + BATCH_SIZE < entries.length) {
      await new Promise(r => setTimeout(r, 600)); // Jeda 600ms antar batch untuk mencegah rate limit
    }
  }
  const rows = results.filter((r): r is FacilRow => r !== null);

  if (rows.length === 0) {
    console.warn(`[sheet] Semua ${entries.length} fetch LK fasilitator gagal - masih memakai data contoh. Cek log di atas untuk penyebabnya.`);
    return loadSampleRows();
  }
  if (rows.length < entries.length) {
    console.warn(`[sheet] ${rows.length} dari ${entries.length} fasilitator berhasil diambil datanya - sisanya dilewati (lihat log di atas).`);
  }
  
  facilRowsCache = { at: Date.now(), rows };
  return rows;
}

// --- "Hari ke-" hari ini (tab "Check Point" di spreadsheet controller) --

/**
 * DIKONFIRMASI 2026-07-16: tab "Check Point" ada di spreadsheet CONTROLLER
 * (bukan spreadsheet terpisah), kolom persis sama dengan v1 - "No",
 * "Tanggal", "Hari ke-", "Checkpoints" - dan 14 baris checkpoint-nya (nama +
 * "Hari ke-") cocok PERSIS dengan yang dipakai di
 * packages/core/knowledge/checkpoints.ts.
 *
 * Dipakai lewat Google Visualization API (`/gviz/tq?sheet=NAMA`) yang bisa
 * fetch tab BERDASARKAN NAMA, bukan gid - lebih tahan banting daripada pola
 * gid v1 (SHEET_CHECKPOINT_GID) karena tidak perlu tahu angka gid sama
 * sekali, cukup nama tab-nya (yang sudah dikonfirmasi persis "Check Point"). */
function checkpointSheetUrl(): string | null {
  const base = process.env.CONTROLLER_SHEET_URL;
  if (!base) return null;
  const idMatch = base.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const params = new URLSearchParams({ tqx: "out:csv", sheet: "Check Point" });
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/gviz/tq?${params.toString()}`;
}

const INDO_MONTHS: Record<string, number> = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

function parseIndoDate(text: string): Date | null {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const month = INDO_MONTHS[match[2].toLowerCase()];
  if (month == null) return null;
  return new Date(parseInt(match[3], 10), month, parseInt(match[1], 10));
}

export interface CheckpointScheduleEntry {
  no: number;
  hari: number;
  checkpoint: string;
  tanggal: Date | null;
}

/** Fetches tab "Check Point" dari spreadsheet controller. Mengembalikan []
 * kalau CONTROLLER_SHEET_URL belum diset, ATAU fetch-nya gagal (mis. sheet
 * belum di-share publik) - getTodayHari() di bawah otomatis fallback ke
 * jangkar tetap di kedua kasus itu, sama seperti v1. */
export async function getCheckpointSchedule(): Promise<CheckpointScheduleEntry[]> {
  const url = checkpointSheetUrl();
  if (!url) return [];
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 300 } });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const csv = await res.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return parsed.data
    .filter((r) => (r["Checkpoints"] ?? "").trim() !== "")
    .map((r) => ({
      no: parseInt(r["No"], 10),
      hari: parseInt(r["Hari ke-"], 10),
      checkpoint: (r["Checkpoints"] ?? "").trim(),
      tanggal: parseIndoDate(r["Tanggal"] ?? ""),
    }));
}

/** Jangkar tetap - dipakai selama tab "Check Point" belum bisa diambil
 * (CONTROLLER_CHECKPOINT_GID belum diisi, atau sheet belum publik). Bisa
 * digeser lewat CYCLE_ANCHOR_HARI/CYCLE_ANCHOR_DATE di .env.local. */
const FALLBACK_ANCHOR_HARI = parseInt(process.env.CYCLE_ANCHOR_HARI || "1", 10);
const FALLBACK_ANCHOR_DATE = process.env.CYCLE_ANCHOR_DATE ? new Date(process.env.CYCLE_ANCHOR_DATE) : new Date(2026, 6, 6);
const FALLBACK_ANCHOR = { hari: FALLBACK_ANCHOR_HARI, tanggal: FALLBACK_ANCHOR_DATE };

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Menentukan "Hari ke-" untuk tanggal tertentu (default hari ini), berdasar
 * jadwal di tab "Check Point" kalau tersedia, dengan fallback ke
 * FALLBACK_ANCHOR kalau tidak. Hasil di-clamp ke rentang siklus 1-14 - pola
 * identik v1 (lib/sheet.ts), cuma sumbernya sekarang controller sheet. */
export async function getTodayHari(referenceDate: Date = new Date()): Promise<number> {
  const schedule = await getCheckpointSchedule();
  const anchorEntry = schedule.find((e) => e.tanggal != null);
  const anchor = anchorEntry?.tanggal ? { hari: anchorEntry.hari, tanggal: anchorEntry.tanggal } : FALLBACK_ANCHOR;

  const base = new Date(anchor.tanggal);
  base.setDate(base.getDate() - (anchor.hari - 1));
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((stripTime(referenceDate).getTime() - stripTime(base).getTime()) / msPerDay);
  return Math.min(14, Math.max(1, diffDays + 1));
}
