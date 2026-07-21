/**
 * =====================================================================
 * SCRAPING KENDALA 390 LK FASILITATOR (DENGAN SISTEM BATCH)
 * =====================================================================
 * Script BERDIRI SENDIRI. Loop ke 390 LK fasilitator (link diambil dari
 * kolom "LK Fasilitator"), catat kendala AKTIF (sama seperti "Lembar Kerja
 * Fasilitator" sebelumnya -- tidak peduli hari, murni status terkini per
 * sekolah), tulis ke kolom Kendala Komunikasi s.d. Kendala Penyepakatan RAB.
 *
 * KARENA SKALANYA BESAR (390 LK), satu kali klik BELUM TENTU cukup -- Apps
 * Script punya batas waktu eksekusi (~6 menit). Makanya script ini pakai
 * SISTEM BATCH/CHECKPOINT: tiap kali dijalankan, ia lanjut dari baris
 * terakhir yang berhasil diproses, bukan mulai dari 0 lagi.
 *
 * Cara pakai:
 * 1. Sesuaikan MASTER_CONFIG di bawah (terutama MASTER_SHEET_NAME dan nomor
 *    kolom) supaya cocok dengan sheet Anda.
 * 2. Extensions > Apps Script, buat project baru, paste seluruh isi file ini.
 * 3. Refresh spreadsheet -> menu "Scraping 390 LK" muncul.
 * 4. Klik "Proses Batch Sekarang" berkali-kali sampai selesai (LOGS akan
 *    bilang progresnya), ATAU klik "Setup Trigger Otomatis (tiap 5 menit)"
 *    supaya lanjut sendiri tanpa perlu klik manual.
 * 5. Kalau mau mulai ulang dari baris 1 (refresh total), klik
 *    "Reset & Mulai dari Awal".
 * =====================================================================
 */

// ============================ KONFIGURASI ============================

const MASTER_CONFIG = {
  // GANTI sesuai nama sheet Anda yang berisi tabel 390 fasilitator ini
  MASTER_SHEET_NAME: 'Daftar Fasilitator',
  LOG_SHEET_NAME: 'LOGS - Scraping 390',

  DATA_START_ROW: 2, // baris 1 = header, data mulai baris 2

  // Nomor kolom sesuai urutan header yang Anda kasih:
  // No, Code Name, Atmin, Kode Fasil, Nama Fasil, LK Log, LK Fasilitator, ...10 kendala...
  COL_NO: 1,               // A
  COL_CODE_NAME: 2,         // B
  COL_ATMIN: 3,              // C
  COL_KODE_FASIL: 4,         // D
  COL_NAMA_FASIL: 5,         // E
  COL_LK_LOG: 6,             // F
  COL_LK_FASILITATOR: 7,     // G -- sumber link yang di-scraping
  COL_JUMLAH_MUNDUR: 8,       // H -- hasil hitung jumlah sekolah mengundurkan diri
  COL_KENDALA_START: 9,        // I -- kolom kendala pertama (Kendala Komunikasi)
  // Kendala terakhir (Kendala Penyepakatan RAB) otomatis di kolom
  // COL_KENDALA_START + 9 = Q, karena ada 10 kolom kendala.

  // Batas waktu per-batch (safety margin dari limit 6 menit Apps Script)
  BATCH_TIME_BUDGET_MS: 4.5 * 60 * 1000,

  // --- Pengaturan pembacaan LK fasilitator (sama seperti sebelumnya) ---
  FASIL_SHEET_NAME: 'Isi Disini',
  FASIL_DATA_START_ROW: 5,
  FASIL_COL_HARI: 2,
  FASIL_COL_NPSN: 3,
  FASIL_MAX_COL: 43,

  MIN_HARI_KE: 1,
  MAX_HARI_KE: 14,

  // Hari ke-1 program dimulai tanggal ini -- dipakai untuk hitung "hari ini
  // seharusnya Hari ke berapa", supaya bisa deteksi fasilitator yang baru
  // mengisi status komunikasi sampai hari sekian (belum sampai hari ini).
  PROGRAM_START_DATE: '2026-07-06',

  // Kolom status komunikasi (checkpoint utk Kendala Komunikasi) di LK fasilitator
  KOMUNIKASI_STATUS_COL: 'G',
  KOMUNIKASI_MIN_HARI: 2, // checkpoint Kendala Komunikasi baru berlaku mulai hari ini

  // Kolom A.6 "Apakah sekolah mengundurkan diri?" di LK fasilitator
  MUNDUR_COL: 'L',
  MUNDUR_YES_VALUES: ['ya'], // dibandingkan case-insensitive, trim

  IGNORE_VALUES: ['tidak ada', 'tidak ada kendala', 'tidak ada masalah', '-', 'n/a', 'nihil'],
  RESOLVED_STATUS_VALUES: ['sesuai', 'sudah sesuai', 'sudah unggah berkas semua', 'memiliki'],
};

const MASTER_COLUMN_MAP = [
  { label: 'Kendala Komunikasi', sourceCol: 'H', statusChecks: [{ col: 'G' }] },
  { label: 'Kendala Memiliki Panlak/Format/Template Dokumen', sourceCol: 'P', statusChecks: [{ col: 'N' }, { col: 'O' }] },
  { label: 'Kendala Mendapatkan Perencana', sourceCol: 'R', statusChecks: [{ col: 'Q' }] },
  { label: 'Kendala Verifikasi Biodata oleh Fasilitator', sourceCol: 'X', statusChecks: [{ col: 'W' }] },
  { label: 'Kendala Update Dapodik', sourceCol: 'Z', statusChecks: [{ col: 'Y' }] },
  { label: 'Kendala Penyusunan Dokumen Admin', sourceCol: 'AD', statusChecks: [{ col: 'AC' }] },
  { label: 'Kendala Verifikasi Dokumen Admin oleh Fasilitator', sourceCol: 'AM', statusChecks: [{ col: 'AL' }] },
  { label: 'Kendala Penyusunan Dokumen Teknis', sourceCol: 'AF', statusChecks: [{ col: 'AE' }] },
  { label: 'Kendala Verifikasi Dokumen Teknis oleh Fasilitator', sourceCol: 'AO', statusChecks: [{ col: 'AN' }] },
  { label: 'Kendala Penyepakatan RAB', sourceCol: 'AQ', statusChecks: [{ col: 'AP' }] },
];

const MASTER_LOG_HEADERS = ['Timestamp', 'Baris', 'Nama Fasil', 'Kolom', 'Kendala', 'Keterangan'];
const MASTER_PROGRESS_KEY = 'MASTER_SCRAPE_LAST_ROW';

// ============================ MENU ============================

// PENTING: kalau script ini digabung dalam SATU project Apps Script bersama
// script lain yang juga punya onOpen() (misal "Logging Matriks"), function
// onOpen() cuma boleh ada SATU per project -- makanya di sini namanya
// masterBuildMenu_ (bukan onOpen), lalu dipanggil dari onOpen() gabungan.
// Kalau script INI dipakai SENDIRIAN (project terpisah), tinggal uncomment
// baris "function onOpen() { masterBuildMenu_(); }" di bawah.
function masterBuildMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('Scraping 390 LK')
    .addItem('Proses Batch Sekarang', 'masterProcessBatch')
    .addItem('Cek Progres', 'masterShowProgress')
    .addSeparator()
    .addItem('Reset & Mulai dari Awal', 'masterResetProgress')
    .addSeparator()
    .addItem('Setup Trigger Otomatis (tiap 5 menit)', 'masterSetupTrigger')
    .addItem('Hapus Trigger Otomatis', 'masterRemoveTrigger')
    .addToUi();
}

// Kalau script ini dipakai SENDIRIAN (project terpisah, TIDAK digabung dengan
// script "Logging Matriks"), hapus tanda komentar pada function di bawah ini:
// function onOpen() { masterBuildMenu_(); }

// ============================ FUNGSI UTAMA (BATCH) ============================

// Wrapper dengan LockService -- INI yang dipasang ke trigger. Kalau ada
// eksekusi lain (dari trigger sebelumnya yang masih jalan) yang masih
// memegang lock, eksekusi baru ini TIDAK ikut jalan, langsung keluar dengan
// aman -- mencegah dua batch berjalan bersamaan berebut update progress yang
// sama (yang bisa bikin baris ke-skip atau diproses dobel).
function masterProcessBatch() {
  const lock = LockService.getScriptLock();
  let hasLock = false;
  try {
    hasLock = lock.tryLock(5000); // tunggu maksimal 5 detik
  } catch (e) {
    hasLock = false;
  }

  if (!hasLock) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = masterGetOrCreateLogSheet_(ss);
    masterWriteLogs_(logSheet, [[new Date(), '-', '-', '-', '-',
      'INFO: Eksekusi lain sedang berjalan (lock dipegang) -- dilewati, tidak ikut jalan bersamaan.']]);
    return;
  }

  try {
    masterProcessBatchInner_();
  } finally {
    lock.releaseLock();
  }
}

function masterProcessBatchInner_() {
  const startTime = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = masterGetOrCreateLogSheet_(ss);
  const runTime = new Date();
  const logRows = [];

  const sheet = ss.getSheetByName(MASTER_CONFIG.MASTER_SHEET_NAME);
  if (!sheet) {
    logRows.push([runTime, '-', '-', '-', '-',
      'FATAL ERROR: Sheet "' + MASTER_CONFIG.MASTER_SHEET_NAME + '" tidak ditemukan. ' +
      'Cek MASTER_CONFIG.MASTER_SHEET_NAME di script.']);
    masterWriteLogs_(logSheet, logRows);
    return;
  }

  const lastRow = sheet.getLastRow();
  const totalDataRows = lastRow - MASTER_CONFIG.DATA_START_ROW + 1;
  if (totalDataRows <= 0) {
    logRows.push([runTime, '-', '-', '-', '-', 'INFO: Tidak ada baris data ditemukan.']);
    masterWriteLogs_(logSheet, logRows);
    return;
  }

  const props = PropertiesService.getScriptProperties();
  let lastProcessedRow = parseInt(props.getProperty(MASTER_PROGRESS_KEY) || String(MASTER_CONFIG.DATA_START_ROW - 1), 10);

  if (lastProcessedRow >= lastRow) {
    // Sudah selesai semua -> mulai ulang dari awal (siklus refresh berkelanjutan)
    logRows.push([runTime, '-', '-', '-', '-', 'INFO: Semua baris sudah pernah diproses -- mulai ulang dari baris ' + MASTER_CONFIG.DATA_START_ROW]);
    lastProcessedRow = MASTER_CONFIG.DATA_START_ROW - 1;
  }

  const startRow = lastProcessedRow + 1;
  logRows.push([runTime, '-', '-', '-', '-',
    'INFO: Batch dimulai dari baris ' + startRow + ' (total data: baris ' + MASTER_CONFIG.DATA_START_ROW + ' s.d. ' + lastRow + ')']);

  let processedCount = 0;
  let currentRow = startRow;

  for (; currentRow <= lastRow; currentRow++) {
    if (Date.now() - startTime > MASTER_CONFIG.BATCH_TIME_BUDGET_MS) {
      logRows.push([runTime, '-', '-', '-', '-',
        'INFO: Batas waktu batch tercapai, berhenti di baris ' + (currentRow - 1) + '. Jalankan lagi untuk lanjut.']);
      break;
    }

    const namaFasil = String(sheet.getRange(currentRow, MASTER_CONFIG.COL_NAMA_FASIL).getValue() || '').trim();
    const url = masterGetUrlFromCell_(sheet, currentRow, MASTER_CONFIG.COL_LK_FASILITATOR);

    if (!url) {
      logRows.push([runTime, currentRow, namaFasil, '-', '-', 'PERINGATAN: Tidak ada link valid di kolom LK Fasilitator, dilewati']);
      processedCount++;
      continue;
    }

    try {
      const result = masterReadFasilitatorData_(url);

      sheet.getRange(currentRow, MASTER_CONFIG.COL_JUMLAH_MUNDUR).setValue(result.jumlahMundur);

      const rowValues = MASTER_COLUMN_MAP.map(function (m) { return result.activeValue[m.label] || ''; });
      sheet.getRange(currentRow, MASTER_CONFIG.COL_KENDALA_START, 1, MASTER_COLUMN_MAP.length).setValues([rowValues]);

      logRows.push([runTime, currentRow, namaFasil, '-', '-',
        'INFO: OK | Sheet "' + result.sheetName + '" | Sekolah (roster): ' + result.totalSchoolsRoster +
        ' | NPSN merged: ' + result.mergedNpsnCount +
        ' | Hari komunikasi terakhir diisi: ' + (result.lastFilledHariKomunikasi === null ? '(belum pernah)' : result.lastFilledHariKomunikasi) +
        ' | Hari ke sekarang: ' + result.currentHari +
        ' | Jumlah mundur: ' + result.jumlahMundur]);

      MASTER_COLUMN_MAP.forEach(function (m) {
        if (result.activeValue[m.label]) {
          logRows.push([runTime, currentRow, namaFasil, m.label, result.activeValue[m.label], 'KENDALA AKTIF']);
        }
      });
    } catch (e) {
      logRows.push([runTime, currentRow, namaFasil, '-', '-', 'ERROR: ' + e.message]);
    }

    processedCount++;
  }

  const newLastProcessed = currentRow - 1;
  props.setProperty(MASTER_PROGRESS_KEY, String(newLastProcessed));

  const isComplete = newLastProcessed >= lastRow;
  logRows.push([runTime, '-', '-', '-', '-',
    'INFO: Batch selesai. ' + processedCount + ' baris diproses kali ini. Progres: baris ' + newLastProcessed + '/' + lastRow +
    (isComplete ? ' -- SEMUA SUDAH SELESAI diproses.' : ' -- BELUM SELESAI, jalankan lagi untuk lanjut.')]);

  masterWriteLogs_(logSheet, logRows);
}

function masterShowProgress() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_CONFIG.MASTER_SHEET_NAME);
  const lastRow = sheet ? sheet.getLastRow() : 0;
  const props = PropertiesService.getScriptProperties();
  const lastProcessedRow = parseInt(props.getProperty(MASTER_PROGRESS_KEY) || String(MASTER_CONFIG.DATA_START_ROW - 1), 10);
  const totalDataRows = lastRow - MASTER_CONFIG.DATA_START_ROW + 1;
  const doneCount = Math.max(0, lastProcessedRow - MASTER_CONFIG.DATA_START_ROW + 1);

  SpreadsheetApp.getUi().alert(
    'Progres: ' + doneCount + ' / ' + totalDataRows + ' baris\n' +
    'Baris terakhir diproses: ' + lastProcessedRow + ' (dari total sampai baris ' + lastRow + ')\n\n' +
    (lastProcessedRow >= lastRow ? 'Sudah selesai semua. Batch berikutnya akan mulai ulang dari awal.' : 'Belum selesai -- jalankan "Proses Batch Sekarang" lagi untuk lanjut.')
  );
}

function masterResetProgress() {
  PropertiesService.getScriptProperties().deleteProperty(MASTER_PROGRESS_KEY);
  SpreadsheetApp.getUi().alert('Progres direset. Batch berikutnya akan mulai dari baris ' + MASTER_CONFIG.DATA_START_ROW + '.');
}

// ============================ BACA URL DARI CELL ============================

function masterGetUrlFromCell_(sheet, row, col) {
  const cell = sheet.getRange(row, col);

  const richValue = cell.getRichTextValue();
  if (richValue && richValue.getLinkUrl()) return richValue.getLinkUrl();

  const formula = cell.getFormula();
  if (formula) {
    const match = formula.match(/HYPERLINK\(\s*"([^"]+)"/i);
    if (match) return match[1];
  }

  const plainValue = String(cell.getValue() || '').trim();
  if (/^https?:\/\//i.test(plainValue)) return plainValue;

  return null;
}

// ============================ BACA LK & HITUNG KENDALA AKTIF ============================

function masterReadFasilitatorData_(url) {
  const gid = masterParseGidFromUrl_(url);
  const externalSs = SpreadsheetApp.openByUrl(url);

  let sheet = null;
  if (MASTER_CONFIG.FASIL_SHEET_NAME) sheet = externalSs.getSheetByName(MASTER_CONFIG.FASIL_SHEET_NAME);
  if (!sheet && gid !== null) {
    sheet = externalSs.getSheets().find(function (sh) { return sh.getSheetId() === gid; }) || null;
  }
  if (!sheet) sheet = externalSs.getSheets()[0];

  const lastRow = sheet.getLastRow();
  if (lastRow < MASTER_CONFIG.FASIL_DATA_START_ROW) {
    return { activeValue: {}, jumlahMundur: 0, sheetName: sheet.getName(), totalSchoolsRoster: 0, mergedNpsnCount: 0,
      lastFilledHariKomunikasi: null, currentHari: masterComputeCurrentHari_() };
  }

  const numRows = lastRow - MASTER_CONFIG.FASIL_DATA_START_ROW + 1;
  const values = sheet.getRange(
    MASTER_CONFIG.FASIL_DATA_START_ROW, 1, numRows, MASTER_CONFIG.FASIL_MAX_COL
  ).getValues();

  // Forward-fill NPSN yang cell-nya di-merge
  const npsnByRow = values.map(function (row) {
    return String(row[MASTER_CONFIG.FASIL_COL_NPSN - 1] || '').trim();
  });
  let mergedNpsnCount = 0;
  try {
    const npsnRange = sheet.getRange(MASTER_CONFIG.FASIL_DATA_START_ROW, MASTER_CONFIG.FASIL_COL_NPSN, numRows, 1);
    const mergedRanges = npsnRange.getMergedRanges();
    mergedRanges.forEach(function (mr) {
      const startRow0 = mr.getRow() - MASTER_CONFIG.FASIL_DATA_START_ROW;
      const numMergedRows = mr.getNumRows();
      if (startRow0 < 0 || startRow0 >= npsnByRow.length) return;
      const topVal = npsnByRow[startRow0];
      for (let k = 1; k < numMergedRows; k++) {
        if (startRow0 + k < npsnByRow.length) {
          npsnByRow[startRow0 + k] = topVal;
          mergedNpsnCount++;
        }
      }
    });
  } catch (e) {
    // lanjut apa adanya
  }

  const allSchoolsRoster = new Set();
  const touchHistory = {};
  MASTER_COLUMN_MAP.forEach(function (m) { touchHistory[m.label] = {}; });

  // Lacak hari TERAKHIR fasilitator ini benar-benar mengisi status komunikasi
  // (kolom G) -- dipakai untuk deteksi "baru mengisi sampai hari ke-N"
  let lastFilledHariKomunikasi = null;
  const komunikasiColIdx0 = masterLetterToColumn_(MASTER_CONFIG.KOMUNIKASI_STATUS_COL) - 1;

  // Riwayat status "mengundurkan diri" per sekolah (kunci: npsn), dipakai
  // untuk ambil status TERAKHIR (bukan hitung baris mentah)
  const mundurHistory = {}; // npsn -> { hariNum, val }
  const mundurColIdx0 = masterLetterToColumn_(MASTER_CONFIG.MUNDUR_COL) - 1;

  values.forEach(function (row, rowIdx) {
    const hariRaw = row[MASTER_CONFIG.FASIL_COL_HARI - 1];
    if (hariRaw === '' || hariRaw === null || hariRaw === undefined) return;

    const hariNum = masterParseHariNumber_(hariRaw);
    if (isNaN(hariNum) || hariNum < MASTER_CONFIG.MIN_HARI_KE || hariNum > MASTER_CONFIG.MAX_HARI_KE) return;

    const npsn = npsnByRow[rowIdx];
    if (!npsn) return;

    allSchoolsRoster.add(npsn);

    const komunikasiVal = row[komunikasiColIdx0];
    const komunikasiFilled = komunikasiVal !== '' && komunikasiVal !== null && komunikasiVal !== undefined;
    if (komunikasiFilled && (lastFilledHariKomunikasi === null || hariNum > lastFilledHariKomunikasi)) {
      lastFilledHariKomunikasi = hariNum;
    }

    // Catat status mundur (kolom L) -- simpan yang TERBARU per sekolah
    const mundurVal = row[mundurColIdx0];
    const mundurTrim = (mundurVal === '' || mundurVal === null || mundurVal === undefined) ? '' : String(mundurVal).trim();
    if (mundurTrim !== '') {
      const existingMundur = mundurHistory[npsn];
      if (!existingMundur || hariNum >= existingMundur.hariNum) {
        mundurHistory[npsn] = { hariNum: hariNum, val: mundurTrim };
      }
    }

    MASTER_COLUMN_MAP.forEach(function (m) {
      const colIndex0 = masterLetterToColumn_(m.sourceCol) - 1;
      const val = row[colIndex0];
      const valTrimmed = (val === '' || val === null || val === undefined) ? '' : String(val).trim();

      const statusResolvedThisRow = m.statusChecks.some(function (check) {
        const sIdx = masterLetterToColumn_(check.col) - 1;
        const sVal = row[sIdx];
        const sTrim = (sVal === '' || sVal === null || sVal === undefined) ? '' : String(sVal).trim();
        return sTrim !== '' && masterIsResolvedStatus_(sTrim);
      });

      if (statusResolvedThisRow) {
        if (!touchHistory[m.label][npsn]) touchHistory[m.label][npsn] = [];
        touchHistory[m.label][npsn].push({ hariNum: hariNum, val: '' });
      } else if (valTrimmed !== '') {
        if (!touchHistory[m.label][npsn]) touchHistory[m.label][npsn] = [];
        touchHistory[m.label][npsn].push({ hariNum: hariNum, val: valTrimmed });
      }
    });
  });

  const activeValue = {};
  MASTER_COLUMN_MAP.forEach(function (m) {
    const schoolNpsns = Object.keys(touchHistory[m.label]);
    const issues = [];
    schoolNpsns.forEach(function (npsn) {
      const events = touchHistory[m.label][npsn];
      events.sort(function (a, b) { return a.hariNum - b.hariNum; });
      const latest = events[events.length - 1];
      if (latest && latest.val && !masterIsIgnoredValue_(latest.val)) {
        issues.push(latest.val);
      }
    });
    activeValue[m.label] = Array.from(new Set(issues)).join(', ');
  });

  // Deteksi "baru mengisi sampai hari ke-N": bandingkan hari terakhir status
  // komunikasi diisi vs hari ke berapa SEHARUSNYA sekarang (dari tanggal).
  // Cuma dicek kalau checkpoint Kendala Komunikasi sudah aktif (hari sekarang
  // >= KOMUNIKASI_MIN_HARI), sesuai konsep checkpoint yang sudah ada.
  const currentHari = masterComputeCurrentHari_();
  if (currentHari >= MASTER_CONFIG.KOMUNIKASI_MIN_HARI) {
    let catatanProgress = null;
    if (lastFilledHariKomunikasi === null) {
      catatanProgress = 'Belum pernah mengisi status komunikasi sama sekali';
    } else if (lastFilledHariKomunikasi < currentHari) {
      catatanProgress = 'Baru mengisi sampai Hari ke-' + lastFilledHariKomunikasi + ' (harusnya sudah Hari ke-' + currentHari + ')';
    }

    if (catatanProgress) {
      const existing = activeValue['Kendala Komunikasi'];
      activeValue['Kendala Komunikasi'] = existing ? (existing + ', ' + catatanProgress) : catatanProgress;
    }
  }

  // Hitung jumlah sekolah yang status TERAKHIRNYA "Ya" (mengundurkan diri)
  let jumlahMundur = 0;
  Object.keys(mundurHistory).forEach(function (npsn) {
    const normalized = mundurHistory[npsn].val.toLowerCase().trim();
    if (MASTER_CONFIG.MUNDUR_YES_VALUES.indexOf(normalized) !== -1) {
      jumlahMundur++;
    }
  });

  return {
    activeValue: activeValue,
    jumlahMundur: jumlahMundur,
    sheetName: sheet.getName(),
    totalSchoolsRoster: allSchoolsRoster.size,
    mergedNpsnCount: mergedNpsnCount,
    lastFilledHariKomunikasi: lastFilledHariKomunikasi,
    currentHari: currentHari,
  };
}

function masterIsIgnoredValue_(val) {
  const normalized = val.toLowerCase().trim().replace(/\s+/g, ' ');
  return MASTER_CONFIG.IGNORE_VALUES.indexOf(normalized) !== -1;
}

function masterIsResolvedStatus_(val) {
  const normalized = val.toLowerCase().trim().replace(/\s+/g, ' ');
  return MASTER_CONFIG.RESOLVED_STATUS_VALUES.indexOf(normalized) !== -1;
}

function masterParseGidFromUrl_(url) {
  const match = url.match(/[#&]gid=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Hari ke berapa SEHARUSNYA sekarang, dihitung dari tanggal (PROGRAM_START_DATE = Hari ke-1)
function masterComputeCurrentHari_() {
  const parts = MASTER_CONFIG.PROGRAM_START_DATE.split('-').map(Number);
  const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  let hari = diffDays + 1;
  if (hari < 1) hari = 1;
  if (hari > MASTER_CONFIG.MAX_HARI_KE) hari = MASTER_CONFIG.MAX_HARI_KE;
  return hari;
}

function masterParseHariNumber_(val) {
  if (typeof val === 'number') return val;
  const match = String(val).match(/\d+/);
  return match ? parseInt(match[0], 10) : NaN;
}

function masterLetterToColumn_(letter) {
  let column = 0;
  for (let i = 0; i < letter.length; i++) {
    column = column * 26 + (letter.charCodeAt(i) - 64);
  }
  return column;
}

// ============================ SHEET LOGS ============================

function masterGetOrCreateLogSheet_(ss) {
  let sheet = ss.getSheetByName(MASTER_CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MASTER_CONFIG.LOG_SHEET_NAME);
    sheet.appendRow(MASTER_LOG_HEADERS);
    sheet.getRange(1, 1, 1, MASTER_LOG_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function masterWriteLogs_(logSheet, logRows) {
  if (logRows.length === 0) return;
  const startRow = logSheet.getLastRow() + 1;
  logSheet.getRange(startRow, 1, logRows.length, MASTER_LOG_HEADERS.length).setValues(logRows);
}

// ============================ TRIGGER ============================

function masterSetupTrigger() {
  masterRemoveTrigger();
  ScriptApp.newTrigger('masterProcessBatch')
    .timeBased()
    .everyMinutes(5)
    .create();
  SpreadsheetApp.getUi().alert('Trigger otomatis tiap 5 menit berhasil dipasang. Script akan lanjut memproses batch berikutnya secara berkala sampai semua 390 baris selesai, lalu otomatis mulai ulang siklus berikutnya.');
}

function masterRemoveTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'masterProcessBatch') {
      ScriptApp.deleteTrigger(t);
    }
  });
}