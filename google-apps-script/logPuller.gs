/**
 * =====================================================================
 * LOGGING MATRIKS DARI SHEET "Log" (390 FASILITATOR)
 * VERSI RETRY-SAMPAI-TERISI + LOCK PER FASILITATOR
 * =====================================================================
 * PERUBAHAN UTAMA dari versi sebelumnya:
 * - Sebelumnya: 1 fasilitator diproses SEKALI per sesi (checkpoint index
 *   sequential), apapun hasilnya (kosong atau tidak) langsung ditulis &
 *   dianggap "selesai" untuk fasilitator itu di sesi ini.
 * - SEKARANG: tiap fasilitator dicek per-status:
 *     * Kalau di sheet "Log" sumbernya SUDAH ADA isi (minimal 1 dari 26
 *       metrik/Skor Akhir tidak kosong) -> ditulis ke masterLog SEKALI,
 *       lalu DIKUNCI ("locked") -- trigger 5 menit berikutnya TIDAK akan
 *       menimpa lagi baris ini walau data di sumber berubah lagi.
 *     * Kalau MASIH KOSONG semua -> TIDAK ditulis dulu, status tetap
 *       "pending", akan DICOBA LAGI di trigger 5 menit berikutnya,
 *       diulang terus sampai window waktu tutup atau sampai akhirnya
 *       ada isi.
 *     * Kalau tidak ada link valid, atau baris Hari Ke-/slot tidak
 *       ditemukan sama sekali di sheet "Log" (error struktural) -> di
 *       skip PERMANEN untuk sesi ini (tidak retry terus tiap 5 menit,
 *       supaya sheet LOGS tidak kebanjiran pesan error yang sama).
 *
 * Status per fasilitator disimpan sebagai 1 karakter dalam string
 * "bitmap" (disimpan di PropertiesService):
 *   '0' = pending (masih kosong, akan dicoba lagi)
 *   '1' = locked (sudah ada isi, sudah ditulis, TIDAK akan ditimpa lagi)
 *   '2' = skip permanen (tidak ada link valid di kolom LK Log)
 *   '3' = skip permanen (error struktural, misal baris tidak ditemukan)
 * Sesi dianggap SELESAI kalau sudah tidak ada '0' tersisa (semua locked
 * atau di-skip).
 *
 * Mekanisme lain TETAP SAMA:
 * 1. Satu fasilitator error TIDAK menghentikan seluruh sesi.
 * 2. Error fatal di luar loop fasilitator tetap tercatat di LOGS.
 * 3. Log di-flush berkala (tiap 25 baris log terkumpul).
 * 4. Lock via LockService supaya tidak ada 2 eksekusi jalan bersamaan.
 * =====================================================================
 * Struktur sheet "Log" YANG DIASUMSIKAN di tiap file fasilitator (2 baris
 * header, data mulai baris 3):
 * Kolom A: Log 1 di 07.00 WIB / Log 2 di 13.30 WIB
 * Kolom B: Hari Ke-
 * Kolom C: Kode Fasil | Kolom D: Nama Fasil (tidak dipakai di sini)
 * Kolom E-F: Kode/Nama Koor (tidak dipakai)
 * Kolom G..AF: 26 metrik | Kolom AG: Skor Akhir
 *
 * Cara pakai:
 * 1. Sesuaikan MLOG_CONFIG di bawah kalau perlu.
 * 2. Ganti/timpa SELURUH isi script lama dengan file ini.
 * 3. Refresh spreadsheet -> menu "Logging Matriks" muncul.
 * 4. Coba dulu lewat "DEBUG: Cek 1 Fasilitator" sebelum pasang trigger.
 * 5. Kalau ada sesi lama yang statusnya masih pakai skema lama (belum
 *    ada MLOG_BITMAP), jalankan "DEBUG: Reset Sesi Hari Ini" dulu supaya
 *    tidak campur dengan skema baru ini.
 * =====================================================================
 */

// ============================ KONFIGURASI ============================

const MLOG_CONFIG = {
  MASTER_SHEET_NAME: 'Daftar Fasilitator', // sheet berisi 390 baris fasilitator
  MLOG_SHEET_NAME: 'masterLog',
  LOG_SHEET_NAME: 'LOGS - masterLog',

  DATA_START_ROW: 2, // baris data di sheet master mulai baris 2

  // Kolom di sheet MASTER (390 baris)
  COL_KODE_FASIL: 4,   // D
  COL_NAMA_FASIL: 5,    // E
  COL_LK_LOG: 6,         // F -- sumber link yang di-scraping di script ini

  // ---------- SUMBER DATA DI TIAP FILE FASILITATOR (sheet "Log") ----------
  LKLOG_SHEET_NAME: 'Log',
  LKLOG_DATA_START_ROW: 3, // data di sheet "Log" mulai baris 3 (baris 1-2 header 2 tingkat)
  LKLOG_COL_LABEL: 1,      // kolom A: "Log 1 di 07.00 WIB" / "Log 2 di 13.30 WIB"
  LKLOG_COL_HARIKE: 2,     // kolom B: Hari Ke-
  LABEL_LOG1: 'Log 1 di 07.00 WIB', // dipetakan dari windowDef.id === 1
  LABEL_LOG2: 'Log 2 di 13.30 WIB', // dipetakan dari windowDef.id === 2

  LKLOG_DATA_START_COL: 'G',
  // 26 metrik + Skor Akhir = 27 nilai, kolom G s.d. AG pada baris yang DITEMUKAN
  LKLOG_NUM_COLS: 27,

  // Hari Ke- dihitung dari tanggal (dipakai juga untuk cari baris di sheet "Log")
  PROGRAM_START_DATE: '2026-07-06',
  MAX_HARI_KE: 20,

  // Jendela waktu logging (jam:menit, 24 jam)
  WINDOWS: [
    { id: 1, startH: 7, startM: 0, endH: 11, endM: 30 },
    { id: 2, startH: 13, startM: 30, endH: 17, endM: 30 },
  ],

  BATCH_TIME_BUDGET_MS: 4.5 * 60 * 1000,
  LOCK_WAIT_MS: 5000, // tunggu maksimal 5 detik utk dapat lock, kalau gagal -> skip

  // Flush log ke sheet tiap N baris terkumpul (mencegah kehilangan log kalau crash)
  LOG_FLUSH_EVERY: 25,
};

// 26 nama metrik (row2) + hari checkpoint masing-masing (row1), urutan HARUS sama
// dengan urutan kolom di sheet "Log" (kolom G s.d. sebelum Skor Akhir)
const MLOG_METRICS = [
  { label: '% Sekolah Sudah Dihubungi/Terhubung', hari: 2 },
  { label: '% Sekolah Sudah Login Aplikasi', hari: 2 },
  { label: '% Sekolah Sudah Memiliki Panlak', hari: 2 },
  { label: '% Sekolah Sudah Memiliki Format/Template', hari: 2 },
  { label: '% Sekolah Biodata Sudah Terverifikasi Sesuai', hari: 3 },
  { label: '% Sekolah Sudah Upload Bukti Update Dapodik', hari: 4 },
  { label: '% Sekolah Memiliki Perencana', hari: 4 },
  { label: '% Sekolah Dok. Admin Terunggah 100% (Lengkap)', hari: 4 },
  { label: 'Rata-rata % Dok. Admin Terunggah (aplikasi)', hari: 4 },
  { label: 'Min (% Dok. Admin Terunggah)', hari: 4 },
  { label: '% Sekolah Dok. Admin Terverifikasi', hari: 5 },
  { label: 'Rata-rata % Dok. Admin Terverifikasi', hari: 5 },
  { label: 'Min (% Dok. Admin Terverifikasi)', hari: 5 },
  { label: '% Sekolah Dok. Admin Sesuai', hari: 7 },
  { label: 'Rata-rata % Dok. Admin Sesuai', hari: 7 },
  { label: 'Min (% Dok. Admin Sesuai)', hari: 7 },
  { label: '% Sekolah Dok. Teknis Terunggah 100% (Lengkap)', hari: 7 },
  { label: 'Rata-rata % Dok. Teknis Terunggah', hari: 7 },
  { label: 'Min (% Dok. Teknis Terunggah)', hari: 7 },
  { label: '% Sekolah Dok. Teknis Terverifikasi', hari: 8 },
  { label: 'Rata-rata % Dok. Teknis Terverifikasi', hari: 8 },
  { label: 'Min (% Dok. Teknis Terverifikasi)', hari: 8 },
  { label: '% Sekolah Dok Teknis Sesuai', hari: 10 },
  { label: 'Rata-rata % Dok. Teknis Sesuai', hari: 10 },
  { label: 'Min (% Dok. Teknis Sesuai)', hari: 10 },
  { label: '% Sekolah Sepakat RAB', hari: 12 },
];

const MLOG_LOG_HEADERS = ['Timestamp', 'Baris Master', 'Nama Fasil', 'Keterangan'];

// ============================ MENU ============================

// PENTING: ini SATU-SATUNYA onOpen() yang boleh ada di project (kalau digabung
// dengan script "Scraping 390 LK" di project yang sama). Function ini membuat
// menu "Logging Matriks" milik sendiri, LALU memanggil masterBuildMenu_() dari
// script "Scraping 390 LK" supaya menu itu juga muncul. Kalau script INI dipakai
// SENDIRIAN (tanpa script Scraping 390 LK di project yang sama), hapus baris
// "masterBuildMenu_();" di bawah supaya tidak error "function tidak ditemukan".
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Logging Matriks')
    .addItem('Jalankan Sekarang (paksa, abaikan jendela jam)', 'mlogRunForced')
    .addItem('Cek Progres', 'mlogShowProgress')
    .addSeparator()
    .addItem('DEBUG: Cek 1 Fasilitator', 'mlogDebugSingleFasilitator')
    .addItem('DEBUG: Cek Status Property Hari Ini', 'mlogCheckPropsUi')
    .addItem('DEBUG: Reset Sesi Hari Ini (hapus progres/done)', 'mlogResetTodayUi')
    .addSeparator()
    .addItem('Setup Trigger Per 5 Menit', 'mlogSetupTrigger')
    .addItem('Hapus Trigger', 'mlogRemoveTrigger')
    .addToUi();

  // Menu dari script "Scraping 390 LK" -- HAPUS baris ini kalau script itu
  // tidak ada di project yang sama.
  masterBuildMenu_();
}

// ============================ ENTRY POINT (DIPANGGIL TRIGGER) ============================

function mlogTick() {
  const now = new Date();
  const jamStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');
  const activeWindow = mlogGetActiveWindow_(now);

  if (!activeWindow) {
    // BARU: Logger.log supaya kelihatan DI EXECUTION LOG kenapa tidak ngapa-ngapain
    // (sebelumnya diam total -> execution log kosong, bikin bingung).
    Logger.log('[' + jamStr + '] Di luar jendela waktu logging (window: 07:00-09:00 & 13:00-15:00) -- tidak melakukan apa-apa.');
    return;
  }

  Logger.log('[' + jamStr + '] Masuk jendela waktu logging ke-' + activeWindow.id + ', mulai proses.');
  mlogRunWindow_(activeWindow, now);
}

// Untuk tes manual dari menu -- paksa jalan walau di luar jendela waktu,
// pakai window ke-1 sebagai default kalau tidak sedang dalam jendela manapun
function mlogRunForced() {
  const now = new Date();
  const activeWindow = mlogGetActiveWindow_(now) || MLOG_CONFIG.WINDOWS[0];
  mlogRunWindow_(activeWindow, now);
}

function mlogGetActiveWindow_(now) {
  const h = now.getHours();
  const m = now.getMinutes();
  const nowMinutes = h * 60 + m;

  for (let i = 0; i < MLOG_CONFIG.WINDOWS.length; i++) {
    const w = MLOG_CONFIG.WINDOWS[i];
    const startMinutes = w.startH * 60 + w.startM;
    const endMinutes = w.endH * 60 + w.endM;
    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) return w;
  }
  return null;
}

// ============================ PROSES SATU JENDELA (DENGAN LOCK & BATCH) ============================

function mlogRunWindow_(windowDef, now) {
  const lock = LockService.getScriptLock();
  let hasLock = false;
  try {
    hasLock = lock.tryLock(MLOG_CONFIG.LOCK_WAIT_MS);
  } catch (e) {
    hasLock = false;
  }

  if (!hasLock) {
    // Ada eksekusi lain yang sedang jalan -> jangan ikut jalan, keluar dengan aman.
    Logger.log('Gagal dapat lock (eksekusi lain sedang berjalan) -- dilewati, tidak ikut jalan bersamaan.');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = mlogGetOrCreateLogSheet_(ss);
    mlogWriteLogs_(logSheet, [[now, '-', '-',
      'INFO: Eksekusi lain sedang berjalan (lock dipegang) -- dilewati, tidak ikut jalan bersamaan.']]);
    return;
  }

  Logger.log('Lock berhasil didapat, mulai proses batch window ke-' + windowDef.id + '.');
  try {
    mlogProcessBatch_(windowDef, now);
  } finally {
    lock.releaseLock();
  }
}

function mlogProcessBatch_(windowDef, now) {
  const startTime = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = mlogGetOrCreateLogSheet_(ss);
  let logRows = [];

  try {
    const masterSheet = ss.getSheetByName(MLOG_CONFIG.MASTER_SHEET_NAME);
    if (!masterSheet) {
      mlogLog_(logRows, now, '-', '-', 'FATAL ERROR: Sheet "' + MLOG_CONFIG.MASTER_SHEET_NAME + '" tidak ditemukan.');
      return;
    }

    const lastRow = masterSheet.getLastRow();
    const totalDataRows = lastRow - MLOG_CONFIG.DATA_START_ROW + 1;
    if (totalDataRows <= 0) {
      mlogLog_(logRows, now, '-', '-', 'INFO: Tidak ada baris fasilitator ditemukan di sheet master.');
      return;
    }

    const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const sessionKey = dateStr + '_w' + windowDef.id;
    const props = PropertiesService.getScriptProperties();

    const doneKey = 'MLOG_DONE_' + sessionKey;
    if (props.getProperty(doneKey) === 'true') {
      mlogLog_(logRows, now, '-', '-', 'INFO: Sesi logging ke-' + windowDef.id + ' tanggal ' + dateStr + ' sudah selesai sebelumnya (semua fasilitator sudah terkunci/di-skip) -- dilewati.');
      return;
    }

    const rowStartKey = 'MLOG_ROWSTART_' + sessionKey;
    const bitmapKey = 'MLOG_BITMAP_' + sessionKey;

    const mlogSheet = mlogGetOrCreateMlogSheet_(ss);

    let mlogRowStart = parseInt(props.getProperty(rowStartKey) || '0', 10);
    let bitmap = props.getProperty(bitmapKey);

    const isFreshStart = !bitmap;
    if (isFreshStart) {
      mlogRowStart = Math.max(mlogSheet.getLastRow() + 1, 3);
      props.setProperty(rowStartKey, String(mlogRowStart));
      bitmap = mlogRepeatChar_('0', totalDataRows); // semua fasilitator PENDING di awal sesi
      mlogLog_(logRows, now, '-', '-',
        'INFO: Sesi logging ke-' + windowDef.id + ' tanggal ' + dateStr + ' DIMULAI -- ' +
        totalDataRows + ' fasilitator akan dicek mulai baris ' + mlogRowStart + ' di "' + MLOG_CONFIG.MLOG_SHEET_NAME + '". ' +
        'Yang datanya masih kosong akan DICOBA LAGI tiap 5 menit sampai window ini tutup; yang sudah berhasil ' +
        'kefetch akan DIKUNCI (tidak ditimpa lagi sesi ini).');
    } else {
      const pendingCount = mlogCountChar_(bitmap, '0');
      mlogLog_(logRows, now, '-', '-',
        'INFO: Sesi logging ke-' + windowDef.id + ' tanggal ' + dateStr + ' DILANJUTKAN -- ' + pendingCount + ' fasilitator masih pending (belum ada data / belum dicoba).');
    }

    const bitmapChars = bitmap.split('');
    const hariKe = mlogComputeHariKe_(now);
    let processedThisTick = 0;

    for (let idx = 0; idx < totalDataRows; idx++) {
      if (bitmapChars[idx] !== '0') continue; // sudah locked/skip/error -- lewati, TIDAK diproses lagi

      if (Date.now() - startTime > MLOG_CONFIG.BATCH_TIME_BUDGET_MS) {
        mlogLog_(logRows, now, '-', '-', 'INFO: Batas waktu batch tercapai setelah memproses ' + processedThisTick +
          ' fasilitator pending kali ini. Sisanya akan dicoba lagi di trigger berikutnya (5 menit lagi, masih dalam jendela waktu yang sama).');
        break;
      }

      const masterRow = MLOG_CONFIG.DATA_START_ROW + idx;
      const targetMlogRow = mlogRowStart + idx;
      let namaFasilMaster = '(gagal baca nama)';

      try {
        namaFasilMaster = String(masterSheet.getRange(masterRow, MLOG_CONFIG.COL_NAMA_FASIL).getValue() || '').trim();
        // BARU: log begitu mulai ngecek fasilitator ini, supaya kelihatan LIVE di execution log
        // sedang ngecek siapa -- bukan cuma muncul di akhir setelah semuanya selesai.
        Logger.log('[' + (idx + 1) + '/' + totalDataRows + '] Mengecek: "' + namaFasilMaster + '" (baris master ' + masterRow + ')...');

        const url = mlogGetUrlFromCell_(masterSheet, masterRow, MLOG_CONFIG.COL_LK_LOG);

        if (!url) {
          // Tidak ada link -- SKIP PERMANEN (bukan "belum ada data", tapi memang tidak bisa dicek), tulis stub 1x.
          mlogSheet.getRange(targetMlogRow, 1, 1, 4).setValues([[now, windowDef.id, hariKe, namaFasilMaster]]);
          mlogLog_(logRows, now, masterRow, namaFasilMaster, 'PERINGATAN: Tidak ada link valid di kolom LK Log -- di-skip permanen (tidak dicoba lagi sesi ini).');
          bitmapChars[idx] = '2';
        } else {
          const rawValues = mlogReadLkLogRow_(url, windowDef.id, hariKe); // [...26 metrik, Skor Akhir] = 27 nilai

          if (mlogSemuaKosong_(rawValues)) {
            // Baris ketemu TAPI datanya masih kosong -- JANGAN ditulis, JANGAN kunci.
            // Bitmap tetap '0', akan dicoba lagi di trigger 5 menit berikutnya.
            Logger.log('  -> masih KOSONG, dilewati sementara (PENDING), akan dicoba lagi 5 menit lagi.');
          } else {
            // Ada isinya -- tulis SEKALI, lalu KUNCI (tidak akan ditimpa lagi sesi ini).
            const rowToWrite = [now, windowDef.id, hariKe, namaFasilMaster].concat(rawValues);
            mlogSheet.getRange(targetMlogRow, 1, 1, rowToWrite.length).setValues([rowToWrite]);
            mlogLog_(logRows, now, masterRow, namaFasilMaster, 'INFO: OK, data ditemukan & DIKUNCI di baris ' + targetMlogRow + ' (tidak akan ditimpa lagi sesi ini).');
            bitmapChars[idx] = '1';
          }
        }
      } catch (e) {
        // Jika error baris tidak ditemukan, JANGAN skip permanen ('3'), 
        // biarkan tetap PENDING ('0') supaya dicoba lagi 5 menit lagi.
        // Siapa tahu fasilitator telat membuat barisnya.
        if (e.message.indexOf('tidak ditemukan di sheet') !== -1) {
          Logger.log('  -> Baris belum dibuat, dilewati sementara (PENDING).');
          // Jangan tulis stub supaya tidak mengacaukan struktur kalau nanti berhasil ditulis.
          bitmapChars[idx] = '0';
        } else {
          // Error fatal lainnya (misal tidak ada akses sheet) -> SKIP PERMANEN
          try {
            mlogSheet.getRange(targetMlogRow, 1, 1, 4).setValues([[now, windowDef.id, hariKe, namaFasilMaster]]);
          } catch (e2) {}
          mlogLog_(logRows, now, masterRow, namaFasilMaster, 'ERROR FATAL (di-skip permanen): ' + e.message);
          bitmapChars[idx] = '3';
        }
      }

      processedThisTick++;

      if (logRows.length >= MLOG_CONFIG.LOG_FLUSH_EVERY) {
        mlogWriteLogs_(logSheet, logRows);
        logRows = [];
      }
    }

    bitmap = bitmapChars.join('');
    props.setProperty(bitmapKey, bitmap);

    const lockedCount = mlogCountChar_(bitmap, '1');
    const skipCount = mlogCountChar_(bitmap, '2');
    const errorCount = mlogCountChar_(bitmap, '3');
    const pendingLeft = mlogCountChar_(bitmap, '0');

    const isComplete = pendingLeft === 0;
    if (isComplete) {
      // PERUBAHAN: Dulu sesi diset SELESAI (MLOG_DONE) dan berhenti.
      // SEKARANG: Kita reset semua yang sudah terkunci ('1') kembali jadi '0',
      // supaya di ronde (trigger) berikutnya dia muter ngecek dari awal lagi!
      // Jadi kalau ada fasilitator yang MENGUBAH datanya, akan tertimpa ke masterLog.
      bitmap = bitmap.replace(/1/g, '0');
      props.setProperty(bitmapKey, bitmap);
    }

    mlogLog_(logRows, now, '-', '-',
      'INFO: Batch selesai. Terkunci (ada data): ' + lockedCount + ', Skip (tanpa link): ' + skipCount +
      ', Error: ' + errorCount + ', Masih pending (kosong/belum dicek ulang): ' + pendingLeft + ' dari ' + totalDataRows + ' total. ' +
      (isComplete ? '1 PUTARAN PENUH SELESAI! Mengulang siklus dari awal agar selalu sinkron (Continuous Polling).'
        : 'Belum selesai 1 putaran -- trigger 5 menit berikutnya akan lanjut mengecek sisa fasilitator.'));

  } catch (fatalError) {
    mlogLog_(logRows, now, '-', '-', 'FATAL ERROR (proses berhenti total): ' + fatalError.message);
  } finally {
    mlogWriteLogs_(logSheet, logRows);
  }
}

function mlogShowProgress() {
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();

  const lines = MLOG_CONFIG.WINDOWS.map(function (w) {
    const sessionKey = dateStr + '_w' + w.id;
    const done = props.getProperty('MLOG_DONE_' + sessionKey) === 'true';
    const bitmap = props.getProperty('MLOG_BITMAP_' + sessionKey);
    let status;
    if (done) {
      status = 'SELESAI (semua fasilitator sudah terkunci/di-skip)';
    } else if (bitmap) {
      status = 'SEDANG BERJALAN (Polling Aktif) -- Terkunci/Dicek: ' + mlogCountChar_(bitmap, '1') +
        ', Skip: ' + mlogCountChar_(bitmap, '2') +
        ', Error: ' + mlogCountChar_(bitmap, '3') +
        ', Menunggu antrian: ' + mlogCountChar_(bitmap, '0');
    } else {
      status = 'Belum dimulai hari ini';
    }
    return 'Logging ke-' + w.id + ' (' + mlogPad_(w.startH) + ':' + mlogPad_(w.startM) + '-' + mlogPad_(w.endH) + ':' + mlogPad_(w.endM) + '): ' + status;
  });

  SpreadsheetApp.getUi().alert('Progres tanggal ' + dateStr + ':\n\n' + lines.join('\n'));
}

function mlogPad_(n) {
  return (n < 10 ? '0' : '') + n;
}

// ============================ DEBUG: CEK STATUS PROPERTY ============================

// Tampilkan isi semua property PropertiesService yang berkaitan dengan sesi
// hari ini (MLOG_DONE / MLOG_BITMAP / MLOG_ROWSTART untuk window 1 & 2),
// lewat popup UI langsung -- tidak perlu buka Executions log manual.
function mlogCheckPropsUi() {
  const ui = SpreadsheetApp.getUi();
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();

  const lines = [];
  MLOG_CONFIG.WINDOWS.forEach(function (w) {
    const sessionKey = dateStr + '_w' + w.id;
    const done = props.getProperty('MLOG_DONE_' + sessionKey);
    const rowStart = props.getProperty('MLOG_ROWSTART_' + sessionKey);
    const bitmap = props.getProperty('MLOG_BITMAP_' + sessionKey);
    lines.push('--- Window ' + w.id + ' (' + sessionKey + ') ---');
    lines.push('MLOG_DONE: ' + (done === null ? '(kosong/belum ada)' : done));
    lines.push('MLOG_ROWSTART: ' + (rowStart === null ? '(kosong/belum ada)' : rowStart));
    if (bitmap) {
      lines.push('MLOG_BITMAP: ' + bitmap.length + ' fasilitator -- Terkunci(1): ' + mlogCountChar_(bitmap, '1') +
        ', Skip(2): ' + mlogCountChar_(bitmap, '2') + ', Error(3): ' + mlogCountChar_(bitmap, '3') +
        ', Pending(0): ' + mlogCountChar_(bitmap, '0'));
    } else {
      lines.push('MLOG_BITMAP: (kosong/belum ada)');
    }
    lines.push('');
  });

  ui.alert('Status Property Tanggal ' + dateStr, lines.join('\n'), ui.ButtonSet.OK);
}

// ============================ DEBUG: RESET SESI HARI INI ============================

// Hapus MLOG_DONE / MLOG_BITMAP / MLOG_ROWSTART untuk window 1 & 2 tanggal
// hari ini, supaya sesi bisa dijalankan ulang dari awal (fresh) lewat
// "Jalankan Sekarang (paksa)". Ada konfirmasi dulu sebelum benar-benar hapus,
// supaya tidak ke-reset tidak sengaja.
function mlogResetTodayUi() {
  const ui = SpreadsheetApp.getUi();
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const resp = ui.alert(
    'Reset Sesi Hari Ini?',
    'Ini akan menghapus status MLOG_DONE / MLOG_BITMAP / MLOG_ROWSTART untuk ' +
    'window 1 dan window 2 tanggal ' + dateStr + '. Baris yang SUDAH tertulis di ' +
    '"' + MLOG_CONFIG.MLOG_SHEET_NAME + '" TIDAK akan dihapus (cuma status sesinya ' +
    'yang direset), jadi kalau dijalankan ulang, SEMUA fasilitator (termasuk yang tadinya ' +
    'sudah terkunci) akan dicek ULANG dari awal dan berpotensi menulis baris duplikat baru.\n\nLanjutkan?',
    ui.ButtonSet.YES_NO
  );

  if (resp !== ui.Button.YES) return;

  const props = PropertiesService.getScriptProperties();
  MLOG_CONFIG.WINDOWS.forEach(function (w) {
    const sessionKey = dateStr + '_w' + w.id;
    props.deleteProperty('MLOG_DONE_' + sessionKey);
    props.deleteProperty('MLOG_BITMAP_' + sessionKey);
    props.deleteProperty('MLOG_ROWSTART_' + sessionKey);
  });

  ui.alert('Reset selesai untuk tanggal ' + dateStr + '. Silakan jalankan ulang lewat "Jalankan Sekarang (paksa)".');
}

// ============================ DEBUG: CEK 1 FASILITATOR ============================

// Ambil data dari SATU fasilitator saja (baris di sheet master pilihan Anda),
// tampilkan mentah-mentah berdampingan dengan label yang seharusnya -- supaya
// gampang cek apakah baris di sheet "Log" ketemu & isinya sudah benar.
// CATATAN: fungsi debug ini TIDAK menyentuh bitmap/lock produksi sama sekali --
// selalu tulis ke sheet "masterLog - DEBUG" terpisah, aman dipakai kapan saja.
function mlogDebugSingleFasilitator() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const masterSheet = ss.getSheetByName(MLOG_CONFIG.MASTER_SHEET_NAME);
  if (!masterSheet) {
    ui.alert('Sheet "' + MLOG_CONFIG.MASTER_SHEET_NAME + '" tidak ditemukan. Cek MLOG_CONFIG.MASTER_SHEET_NAME di script.');
    return;
  }

  const lastRow = masterSheet.getLastRow();
  const defaultRow = MLOG_CONFIG.DATA_START_ROW;

  const respRow = ui.prompt(
    'Debug 1 Fasilitator (1/2)',
    'Masukkan nomor BARIS di sheet "' + MLOG_CONFIG.MASTER_SHEET_NAME + '" yang mau dicek ' +
    '(data mulai baris ' + MLOG_CONFIG.DATA_START_ROW + ', sampai baris ' + lastRow + '). ' +
    'Kosongkan untuk pakai baris ' + defaultRow + ' (fasilitator pertama).',
    ui.ButtonSet.OK_CANCEL
  );
  if (respRow.getSelectedButton() !== ui.Button.OK) return;

  let targetRow = parseInt(respRow.getResponseText().trim(), 10);
  if (isNaN(targetRow)) targetRow = defaultRow;

  if (targetRow < MLOG_CONFIG.DATA_START_ROW || targetRow > lastRow) {
    ui.alert('Baris ' + targetRow + ' di luar rentang data (' + MLOG_CONFIG.DATA_START_ROW + ' - ' + lastRow + ').');
    return;
  }

  const respWindow = ui.prompt(
    'Debug 1 Fasilitator (2/2)',
    'Logging ke- berapa yang mau dicek? Ketik 1 (Log 1 di 07.00 WIB) atau 2 (Log 2 di 13.30 WIB). Kosongkan untuk 1.',
    ui.ButtonSet.OK_CANCEL
  );
  if (respWindow.getSelectedButton() !== ui.Button.OK) return;

  let windowId = parseInt(respWindow.getResponseText().trim(), 10);
  if (windowId !== 1 && windowId !== 2) windowId = 1;

  const namaFasilMaster = String(masterSheet.getRange(targetRow, MLOG_CONFIG.COL_NAMA_FASIL).getValue() || '').trim();
  const url = mlogGetUrlFromCell_(masterSheet, targetRow, MLOG_CONFIG.COL_LK_LOG);

  if (!url) {
    ui.alert('Baris ' + targetRow + ' (' + namaFasilMaster + ') tidak punya link valid di kolom LK Log.');
    return;
  }

  const now = new Date();
  const hariKe = mlogComputeHariKe_(now);

  const debugSheet = mlogGetOrCreateDebugSheet_(ss);
  debugSheet.clear();
  mlogApplyHeader_(debugSheet);

  let sheetNameUsed = '';

  try {
    const gid = mlogParseGidFromUrl_(url);
    const externalSs = SpreadsheetApp.openByUrl(url);
    let sheet = null;
    if (MLOG_CONFIG.LKLOG_SHEET_NAME) sheet = externalSs.getSheetByName(MLOG_CONFIG.LKLOG_SHEET_NAME);
    if (!sheet && gid !== null) {
      sheet = externalSs.getSheets().find(function (sh) { return sh.getSheetId() === gid; }) || null;
    }
    if (!sheet) sheet = externalSs.getSheets()[0];
    sheetNameUsed = sheet.getName();

    const label = mlogWindowIdToLabel_(windowId);
    const found = mlogCariBarisLogSrc_(sheet, label, hariKe);
    if (!found) {
      ui.alert('Baris "' + label + '" Hari ke-' + hariKe + ' TIDAK DITEMUKAN di sheet "' + sheetNameUsed + '" untuk "' + namaFasilMaster + '". Ini akan jadi status ERROR (skip permanen) kalau dijalankan di produksi.');
      return;
    }

    const startCol = mlogLetterToColumn_(MLOG_CONFIG.LKLOG_DATA_START_COL);
    const rawValues = sheet.getRange(found.rowNumber, startCol, 1, MLOG_CONFIG.LKLOG_NUM_COLS).getValues()[0];
    const kosong = mlogSemuaKosong_(rawValues);

    const rowToWrite = [now, windowId, hariKe, namaFasilMaster].concat(rawValues);
    debugSheet.getRange(3, 1, 1, rowToWrite.length).setValues([rowToWrite]);
    debugSheet.autoResizeColumns(1, rowToWrite.length);

    ui.alert(
      'Debug selesai untuk "' + namaFasilMaster + '" (baris master ' + targetRow + ', Hari Ke- terhitung: ' + hariKe +
      ', Logging ke-' + windowId + ').\n\n' +
      'Sheet yang dibaca: "' + sheetNameUsed + '", baris ditemukan: ' + found.rowNumber + '.\n' +
      'Status kalau dijalankan di produksi: ' + (kosong
        ? 'MASIH KOSONG -- akan di-skip sementara (PENDING), dicoba lagi tiap 5 menit sampai ada isi.'
        : 'ADA ISI -- akan langsung ditulis & DIKUNCI (tidak ditimpa lagi sesi ini).') + '\n\n' +
      'Hasilnya ada di sheet "' + MLOG_CONFIG.MLOG_SHEET_NAME + ' - DEBUG", baris ke-3.'
    );
  } catch (e) {
    ui.alert('Gagal membaca sheet "Log" untuk "' + namaFasilMaster + '":\n' + e.message);
  }
}

function mlogGetOrCreateDebugSheet_(ss) {
  const name = MLOG_CONFIG.MLOG_SHEET_NAME + ' - DEBUG';
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function mlogColumnToLetter_(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// ============================ HITUNG HARI KE- ============================

function mlogComputeHariKe_(now) {
  const parts = MLOG_CONFIG.PROGRAM_START_DATE.split('-').map(Number);
  const startDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  let hari = diffDays + 1;
  if (hari < 1) hari = 1;
  if (hari > MLOG_CONFIG.MAX_HARI_KE) hari = MLOG_CONFIG.MAX_HARI_KE;
  return hari;
}

// ============================ BACA URL DARI CELL ============================

function mlogGetUrlFromCell_(sheet, row, col) {
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

// ============================ BACA BARIS MATRIKS DARI SHEET "Log" ============================

// Butuh windowId (1/2) & hariKe untuk cari baris yang cocok di sheet "Log".
function mlogReadLkLogRow_(url, windowId, hariKe) {
  const gid = mlogParseGidFromUrl_(url);
  const externalSs = SpreadsheetApp.openByUrl(url);

  let sheet = null;
  if (MLOG_CONFIG.LKLOG_SHEET_NAME) sheet = externalSs.getSheetByName(MLOG_CONFIG.LKLOG_SHEET_NAME);
  if (!sheet && gid !== null) {
    sheet = externalSs.getSheets().find(function (sh) { return sh.getSheetId() === gid; }) || null;
  }
  if (!sheet) sheet = externalSs.getSheets()[0];

  const label = mlogWindowIdToLabel_(windowId);
  const found = mlogCariBarisLogSrc_(sheet, label, hariKe);
  if (!found) {
    throw new Error('Baris "' + label + '" Hari ke-' + hariKe + ' tidak ditemukan di sheet "' + sheet.getName() + '"');
  }

  const startCol = mlogLetterToColumn_(MLOG_CONFIG.LKLOG_DATA_START_COL);
  const range = sheet.getRange(found.rowNumber, startCol, 1, MLOG_CONFIG.LKLOG_NUM_COLS);
  return range.getValues()[0];
}

// 1 -> "Log 1 di 07.00 WIB", 2 -> "Log 2 di 13.30 WIB"
function mlogWindowIdToLabel_(windowId) {
  if (Number(windowId) === 1) return MLOG_CONFIG.LABEL_LOG1;
  if (Number(windowId) === 2) return MLOG_CONFIG.LABEL_LOG2;
  return null;
}

// Cari baris di sheet "Log" yang kolom A (label) & kolom B (Hari Ke-) cocok
// dengan target. Data diasumsikan mulai LKLOG_DATA_START_ROW (baris 3).
function mlogCariBarisLogSrc_(sheet, label, hariKe) {
  if (!label) return null;

  const lastRow = sheet.getLastRow();
  const startRow = MLOG_CONFIG.LKLOG_DATA_START_ROW;
  if (lastRow < startRow) return null;

  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, MLOG_CONFIG.LKLOG_COL_LABEL, numRows, 2).getValues(); // kolom label & Hari Ke-

  for (let i = 0; i < data.length; i++) {
    const rowLabel = String(data[i][0] || '').trim();
    const rowHariKe = Number(data[i][1]);
    if (rowLabel === label && rowHariKe === Number(hariKe)) {
      return { rowNumber: startRow + i };
    }
  }
  return null;
}

// ============================ CEK KOSONG (BARU) ============================

// Dipakai untuk menentukan apakah baris di sheet "Log" masih kosong (belum
// diisi fasilitator) atau sudah ada isinya. Dianggap "ADA ISI" kalau MINIMAL
// SATU dari 27 nilai (26 metrik + Skor Akhir) tidak kosong/tidak error.
function mlogNilaiValid_(v) {
  if (v === '' || v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim().startsWith('#')) return false; // #N/A, #REF!, dll
  return true;
}

function mlogSemuaKosong_(values) {
  return values.every(function (v) { return !mlogNilaiValid_(v); });
}

// ============================ HELPER BITMAP ============================

function mlogRepeatChar_(ch, n) {
  // Setara String.prototype.repeat, ditulis manual untuk jaga-jaga kompatibilitas runtime.
  let s = '';
  for (let i = 0; i < n; i++) s += ch;
  return s;
}

function mlogCountChar_(str, ch) {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ch) count++;
  }
  return count;
}

function mlogParseGidFromUrl_(url) {
  const match = url.match(/[#&]gid=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function mlogLetterToColumn_(letter) {
  let column = 0;
  for (let i = 0; i < letter.length; i++) {
    column = column * 26 + (letter.charCodeAt(i) - 64);
  }
  return column;
}

// ============================ HEADER BERSAMA (masterLog & DEBUG PAKAI INI) ============================

// Struktur kolom (SAMA untuk masterLog maupun sheet DEBUG, TIDAK BERUBAH):
// 1: Timestamp | 2: Logging ke- | 3: Hari Ke- (dari sumber) | 4: Nama Fasil (dari sumber)
// 5..30: 26 kolom metrik | 31: Skor Akhir
const MLOG_PALETTE = ['#FFF2CC', '#FCE5CD', '#FFE599', '#F6B26B', '#D9D9D9', '#A2C4C9', '#76A5AF', '#6FA8DC'];

function mlogBuildHeaderRows_() {
  const dayNumbers = MLOG_METRICS.map(function (m) { return m.hari; });
  const metricLabels = MLOG_METRICS.map(function (m) { return m.label; });

  const row1 = ['', '', 'Matriks', 'Checkpoint Hari Ke -->'].concat(dayNumbers).concat(['']);
  const row2 = ['Timestamp', 'Logging ke-', 'Hari Ke -', 'Nama Fasil'].concat(metricLabels).concat(['Skor Akhir']);

  return { row1: row1, row2: row2 };
}

function mlogApplyHeader_(sheet) {
  const built = mlogBuildHeaderRows_();
  const numCols = built.row2.length;

  sheet.getRange(1, 1, 1, built.row1.length).setValues([built.row1]);
  sheet.getRange(2, 1, 1, built.row2.length).setValues([built.row2]);
  sheet.getRange(1, 1, 2, numCols).setFontWeight('bold');
  sheet.setFrozenRows(2);

  const dayColorMap = {};
  let paletteIdx = 0;
  MLOG_METRICS.forEach(function (m) {
    if (!(m.hari in dayColorMap)) {
      dayColorMap[m.hari] = MLOG_PALETTE[paletteIdx % MLOG_PALETTE.length];
      paletteIdx++;
    }
  });

  MLOG_METRICS.forEach(function (m, i) {
    const col = 5 + i; // kolom metrik dimulai dari kolom 5
    const color = dayColorMap[m.hari];
    sheet.getRange(1, col, 2, 1).setBackground(color);
  });

  const skorCol = numCols;
  sheet.getRange(1, skorCol, 2, 1).setBackground('#000000').setFontColor('#FFFFFF');

  sheet.autoResizeColumns(1, numCols);
}

// ============================ SHEET "masterLog" (2 BARIS HEADER) ============================

function mlogGetOrCreateMlogSheet_(ss) {
  let sheet = ss.getSheetByName(MLOG_CONFIG.MLOG_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(MLOG_CONFIG.MLOG_SHEET_NAME);
  mlogApplyHeader_(sheet);
  return sheet;
}

// ============================ SHEET LOGS ============================

function mlogGetOrCreateLogSheet_(ss) {
  let sheet = ss.getSheetByName(MLOG_CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MLOG_CONFIG.LOG_SHEET_NAME);
    sheet.appendRow(MLOG_LOG_HEADERS);
    sheet.getRange(1, 1, 1, MLOG_LOG_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// BARU: helper supaya SETIAP pesan log otomatis tercatat di 2 tempat sekaligus:
// 1) array logRows (nanti ditulis ke sheet "LOGS - masterLog", permanen)
// 2) Logger.log (langsung kelihatan di Apps Script > Executions > klik baris
//    eksekusi -> "Execution log", real-time selagi script jalan)
function mlogLog_(logRows, now, kolomKedua, nama, pesan) {
  logRows.push([now, kolomKedua, nama, pesan]);
  Logger.log((nama && nama !== '-' ? '[' + nama + '] ' : '') + pesan);
}

function mlogWriteLogs_(logSheet, logRows) {
  if (!logRows || logRows.length === 0) return;
  const startRow = logSheet.getLastRow() + 1;
  logSheet.getRange(startRow, 1, logRows.length, MLOG_LOG_HEADERS.length).setValues(logRows);
}

// ============================ TRIGGER ============================

function mlogSetupTrigger() {
  mlogRemoveTrigger();
  ScriptApp.newTrigger('mlogTick')
    .timeBased()
    .everyMinutes(5)
    .create();
  SpreadsheetApp.getUi().alert(
    'Trigger tiap 5 menit berhasil dipasang. Trigger ini akan menyala terus sepanjang hari, ' +
    'tapi HANYA benar-benar memproses data saat jam 07:00-09:00 dan 13:00-15:00. ' +
    'Di luar jam itu, trigger nyala tapi langsung keluar tanpa melakukan apa-apa. ' +
    'Fasilitator yang datanya masih kosong akan terus dicoba tiap 5 menit sampai ada isi atau window tutup.'
  );
}

function mlogRemoveTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'mlogTick') {
      ScriptApp.deleteTrigger(t);
    }
  });
}