/**
 * =====================================================================
 * TIMPA ULANG SHEET "Log" (LK FASIL) DARI DATA "masterLog"
 * =====================================================================
 * Dipakai untuk kasus: data di masterLog (hasil scraping via LK Log link,
 * script "Logging Matriks") sudah benar, tapi sheet "Log" di file
 * masing-masing fasilitator (LK Fasil) tidak sesuai/ketinggalan. Script
 * ini menimpa "Log" pakai data dari masterLog, TAPI hanya untuk:
 *   - fasilitator yang Atmin-nya = TARGET_ADMIN
 *   - baris masterLog dengan Hari Ke- = TARGET_HARI_KE
 *
 * Yang ditimpa di sheet "Log" fasilitator: kolom Label (Log 1/Log 2),
 * Hari Ke-, Kode Fasil, Nama Fasil, 26 kolom metrik (G:AF), dan Skor
 * Akhir (AG). KOLOM LAIN TIDAK DISENTUH SAMA SEKALI.
 *
 * Kalau ada beberapa baris masterLog untuk fasilitator+slot yang sama
 * (misal karena sesi pernah di-reset lalu dijalankan ulang), yang
 * dipakai adalah yang PALING BARU (baris paling bawah di masterLog).
 *
 * CARA PAKAI:
 * 1. Sesuaikan OVR_CONFIG di bawah (terutama kalau struktur kolom
 *    "Daftar Fasilitator" atau lokasi spreadsheet masterLog beda).
 * 2. Paste ke Apps Script editor (project mana saja yang punya akses
 *    ke kedua spreadsheet -- controller & file-file fasilitator).
 * 3. Jalankan dulu dengan DRY_RUN = true, cek hasilnya di menu
 *    Executions / Logger -- pastikan jumlah & nama fasilitator yang
 *    kena SUDAH SESUAI ekspektasi.
 * 4. Kalau sudah yakin, set DRY_RUN = false, jalankan lagi
 *    timpaLogDariMasterLogUntukAdmin().
 * =====================================================================
 */

const OVR_CONFIG = {
  // true = cuma simulasi (tidak menulis apapun, cuma log apa yang AKAN
  // ditimpa). Selalu cek dengan true dulu sebelum jalankan beneran.
  DRY_RUN: false,

  // Spreadsheet berisi sheet "masterLog". Kosongkan '' kalau sama dengan
  // spreadsheet aktif tempat script ini dijalankan.
  MASTERLOG_SPREADSHEET_ID: '',
  MASTERLOG_SHEET_NAME: 'masterLog',

  // Spreadsheet CONTROLLER berisi sheet "Daftar Fasilitator" (kolom
  // Atmin, Kode Fasil, Nama Fasil, Tautan). Kosongkan '' kalau sama
  // dengan spreadsheet aktif.
  CONTROLLER_SPREADSHEET_ID: '',
  CONTROLLER_SHEET_NAME: 'Daftar Fasilitator',
  COL_ATMIN: 3,      // A
  COL_KODEFASIL: 4,  // B
  COL_NAMAFASIL: 5,  // C
  COL_TAUTAN: 6,     // D

  // Sheet "Log" di file masing-masing fasilitator (LK Fasil)
  LOG_SHEET_NAME: 'Log',
  LOG_COL_LABEL: 1,        // A
  LOG_COL_HARIKE: 2,       // B
  LOG_COL_KODEFASIL: 3,    // C
  LOG_COL_NAMAFASIL: 4,    // D
  LOG_COL_METRIC_START: 7, // G
  LOG_COL_SKOR_AKHIR: 33,  // AG
  LOG_PERCENT_FORMAT: '0.00%',

  LOG_LABEL_PAGI: 'Log 1 di 07.00 WIB',
  LOG_LABEL_SIANG: 'Log 2 di 13.30 WIB',

  TIME_BUDGET_MS: 4.5 * 60 * 1000,
};

// ========== ENTRY POINT -- JALANKAN INI DARI EDITOR ==========
function timpaLogDariMasterLogUntukAdmin() {
  const TARGET_ADMIN = 'Mochamad Rifat Syahman Hambali';
  const TARGET_HARI_KE = 14;
  _timpaLogDariMasterLog_(TARGET_ADMIN, TARGET_HARI_KE);
}

function _timpaLogDariMasterLog_(targetAdmin, targetHariKe) {
  const startTime = Date.now();
  const cfg = OVR_CONFIG;

  if (cfg.DRY_RUN) {
    Logger.log('===== MODE DRY_RUN AKTIF -- TIDAK ADA YANG BENAR-BENAR DITULIS =====');
  }

  // ---------- 1. Ambil fasilitator dengan Atmin = targetAdmin ----------
  const controllerSs = cfg.CONTROLLER_SPREADSHEET_ID
    ? SpreadsheetApp.openById(cfg.CONTROLLER_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const controllerSheet = controllerSs.getSheetByName(cfg.CONTROLLER_SHEET_NAME);
  if (!controllerSheet) throw new Error('Sheet "' + cfg.CONTROLLER_SHEET_NAME + '" tidak ditemukan di controller.');

  const cLastRow = controllerSheet.getLastRow();
  const maxCol = Math.max(cfg.COL_ATMIN, cfg.COL_KODEFASIL, cfg.COL_NAMAFASIL, cfg.COL_TAUTAN);
  const controllerData = controllerSheet.getRange(2, 1, cLastRow - 1, maxCol).getValues();

  // Map: nama fasilitator (trim) -> { kodeFasil, spreadsheetId }
  const targetMap = {};
  controllerData.forEach(function (row) {
    const atmin = String(row[cfg.COL_ATMIN - 1] || '').trim();
    if (atmin !== targetAdmin.trim()) return;

    const nama = String(row[cfg.COL_NAMAFASIL - 1] || '').trim();
    const kode = row[cfg.COL_KODEFASIL - 1];
    const tautan = row[cfg.COL_TAUTAN - 1];
    const spreadsheetId = _ovrExtractId_(tautan);
    if (!nama || !spreadsheetId) return;

    targetMap[nama] = { kodeFasil: kode, spreadsheetId: spreadsheetId };
  });

  const namaTerdaftar = Object.keys(targetMap);
  Logger.log('Ditemukan ' + namaTerdaftar.length + ' fasilitator dengan Atmin = "' + targetAdmin + '": ' + namaTerdaftar.join(', '));
  if (namaTerdaftar.length === 0) {
    Logger.log('STOP: Tidak ada fasilitator ditemukan untuk admin ini. Cek ejaan nama admin, atau cek COL_ATMIN di OVR_CONFIG (kolom Atmin mungkin beda posisi).');
    return;
  }

  // ---------- 2. Ambil baris masterLog Hari Ke- = targetHariKe untuk fasilitator2 itu ----------
  const mlogSs = cfg.MASTERLOG_SPREADSHEET_ID
    ? SpreadsheetApp.openById(cfg.MASTERLOG_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const mlogSheet = mlogSs.getSheetByName(cfg.MASTERLOG_SHEET_NAME);
  if (!mlogSheet) throw new Error('Sheet "' + cfg.MASTERLOG_SHEET_NAME + '" tidak ditemukan.');

  const mlogLastRow = mlogSheet.getLastRow();
  if (mlogLastRow < 3) {
    Logger.log('STOP: Sheet masterLog masih kosong (belum ada data mulai baris 3).');
    return;
  }

  // Kolom masterLog: 1 Timestamp | 2 Logging ke- | 3 Hari Ke- | 4 Nama Fasil
  // | 5..30 26 metrik | 31 Skor Akhir
  const NUM_COLS = 31;
  const mlogData = mlogSheet.getRange(3, 1, mlogLastRow - 2, NUM_COLS).getValues();

  // key = "nama|loggingke" -> baris data. Baris di bawah menimpa baris di
  // atas saat looping, jadi otomatis dapat yang PALING BARU kalau ada duplikat.
  const latestByKey = {};
  mlogData.forEach(function (row) {
    const loggingKe = row[1];
    const hariKe = Number(row[2]);
    const nama = String(row[3] || '').trim();
    if (hariKe !== Number(targetHariKe)) return;
    if (!targetMap[nama]) return;
    latestByKey[nama + '|' + loggingKe] = row;
  });

  const keys = Object.keys(latestByKey);
  Logger.log('Ditemukan ' + keys.length + ' slot (fasilitator x logging ke-) di masterLog untuk Hari ke-' + targetHariKe + ' yang cocok dengan admin "' + targetAdmin + '".');
  if (keys.length === 0) {
    Logger.log('STOP: Tidak ada data masterLog yang cocok (cek apakah Hari ke-' + targetHariKe + ' sudah pernah dilogging untuk fasilitator-fasilitator di atas).');
    return;
  }

  // ---------- 3. Timpa sheet "Log" tiap fasilitator ----------
  let sukses = 0, gagal = 0, dilewati = 0;

  for (let i = 0; i < keys.length; i++) {
    if (Date.now() - startTime > cfg.TIME_BUDGET_MS) {
      Logger.log('Waktu habis di slot ke-' + (i + 1) + '/' + keys.length + '. Jalankan ulang timpaLogDariMasterLogUntukAdmin() untuk lanjut sisanya.');
      break;
    }

    const row = latestByKey[keys[i]];
    const loggingKe = row[1];
    const hariKe = row[2];
    const nama = String(row[3] || '').trim();
    const metrics = row.slice(4, 30); // 26 nilai metrik
    const skorAkhir = row[30];

    const logLabel = Number(loggingKe) === 1 ? cfg.LOG_LABEL_PAGI
                    : Number(loggingKe) === 2 ? cfg.LOG_LABEL_SIANG
                    : null;
    const target = targetMap[nama];

    if (!logLabel || !target) {
      dilewati++;
      Logger.log('[LEWATI] "' + nama + '" -- logging ke- tidak dikenali (' + loggingKe + ') atau data fasilitator tidak lengkap.');
      continue;
    }

    try {
      const facSs = SpreadsheetApp.openById(target.spreadsheetId);
      const logSheet = facSs.getSheetByName(cfg.LOG_SHEET_NAME);
      if (!logSheet) throw new Error('Sheet "' + cfg.LOG_SHEET_NAME + '" tidak ditemukan di file fasilitator ini.');

      const targetRow = _ovrFindOrPrepareLogRow_(logSheet, logLabel, hariKe, cfg);

      if (cfg.DRY_RUN) {
        Logger.log('[DRY_RUN] "' + nama + '" -- ' + logLabel + ' Hari ke-' + hariKe +
          ' -> AKAN ditulis ke row ' + targetRow.rowNumber + ' di file "' + facSs.getName() + '" (' +
          (targetRow.isNewRow ? 'baris baru' : 'baris existing, akan ditimpa') + ') | Skor Akhir: ' + skorAkhir);
      } else {
        logSheet.getRange(targetRow.rowNumber, cfg.LOG_COL_KODEFASIL).setValue(target.kodeFasil);
        logSheet.getRange(targetRow.rowNumber, cfg.LOG_COL_NAMAFASIL).setValue(nama);
        logSheet.getRange(targetRow.rowNumber, cfg.LOG_COL_LABEL).setValue(logLabel);
        logSheet.getRange(targetRow.rowNumber, cfg.LOG_COL_HARIKE).setValue(hariKe);

        const metricRange = logSheet.getRange(targetRow.rowNumber, cfg.LOG_COL_METRIC_START, 1, metrics.length);
        metricRange.setValues([metrics]);
        metricRange.setNumberFormat(cfg.LOG_PERCENT_FORMAT);

        const skorCell = logSheet.getRange(targetRow.rowNumber, cfg.LOG_COL_SKOR_AKHIR);
        skorCell.setValue(skorAkhir);
        skorCell.setNumberFormat('0.00');

        Logger.log('[OK] "' + nama + '" -- ' + logLabel + ' Hari ke-' + hariKe + ' -> row ' + targetRow.rowNumber +
          ' di file "' + facSs.getName() + '" (' + (targetRow.isNewRow ? 'baris baru' : 'baris existing, ditimpa') + ') | Skor Akhir: ' + skorAkhir);
      }
      sukses++;
    } catch (err) {
      gagal++;
      Logger.log('[GAGAL] "' + nama + '" -- ' + logLabel + ' Hari ke-' + hariKe + ': ' + err.message);
    }
  }

  Logger.log('===== SELESAI' + (cfg.DRY_RUN ? ' (DRY_RUN)' : '') + ': ' + sukses + ' slot sukses ditimpa, ' +
    gagal + ' gagal, ' + dilewati + ' dilewati (dari ' + keys.length + ' slot yang cocok). =====');
}

// Cari baris existing (label+hariKe cocok) di sheet Log fasilitator, atau
// siapkan baris baru kalau belum ada.
function _ovrFindOrPrepareLogRow_(logSheet, label, hariKe, cfg) {
  const lastRow = logSheet.getLastRow();
  if (lastRow >= 2) {
    const data = logSheet.getRange(2, 1, lastRow - 1, cfg.LOG_COL_HARIKE).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowLabel = data[i][cfg.LOG_COL_LABEL - 1];
      const rowHariKe = data[i][cfg.LOG_COL_HARIKE - 1];
      if (String(rowLabel).trim() === label && Number(rowHariKe) === Number(hariKe)) {
        return { rowNumber: i + 2, isNewRow: false };
      }
    }
  }
  return { rowNumber: lastRow + 1, isNewRow: true };
}

function _ovrExtractId_(url) {
  const match = String(url).match(/[-\w]{25,}/);
  return match ? match[0] : null;
}