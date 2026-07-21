/**
 * =====================================================================
 * SCRIPT UNTUK MEMBUKA (UNHIDE) SEMUA BARIS DI SHEET "Log" PADA 390 LK
 * =====================================================================
 * Script ini berfungsi untuk menampilkan kembali baris yang disembunyikan
 * (di-hide) oleh fasilitator/admin, sehingga Google Visualization API (gviz)
 * bisa membaca data tersebut tanpa hambatan.
 *
 * CARA PENGGUNAAN:
 * 1. Buka file Google Apps Script yang memiliki akses ke Master Spreadsheet.
 * 2. Buat file baru (contoh: unhideRows.gs), lalu paste kode ini.
 * 3. Jalankan fungsi `unhideSemuaSheetLog()`.
 * 4. Izinkan otorisasi jika diminta.
 * 5. Tunggu sekitar 2-4 menit sampai selesai.
 * =====================================================================
 */

function unhideSemuaSheetLog() {
  // GANTI INI DENGAN ID MASTER SPREADSHEET (Controller)
  const MASTER_SS_ID = "1gG23G_a8R8Ucw1O5Q5c7u3k7O3n0m8cR4g_O8xG8O0M"; // atau ambil otomatis jika script nempel di file
  
  // Jika script ini ditempel di dalam file Controller, bisa pakai:
  // const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ss = SpreadsheetApp.getActiveSpreadsheet(); 
  
  const sheetRoster = ss.getSheetByName("Daftar Fasilitator");
  if (!sheetRoster) {
    Logger.log("Sheet 'Daftar Fasilitator' tidak ditemukan!");
    return;
  }
  
  // Ambil semua data di sheet Fasilitator
  const data = sheetRoster.getDataRange().getValues();
  const headers = data[0];
  
  // Cari index kolom URL LK (bisa bernama "LK_LOG", "LK Log", "URL LK", "Link LK")
  let urlColIdx = -1;
  let namaColIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).trim();
    if (h === "LK_LOG" || h === "LK Log" || h === "URL LK" || h === "Link LK") urlColIdx = i;
    if (h === "Nama Fasil") namaColIdx = i;
  }
  
  if (urlColIdx === -1 || namaColIdx === -1) {
    Logger.log("Kolom URL LK atau Nama Fasil tidak ditemukan.");
    return;
  }
  
  const props = PropertiesService.getScriptProperties();
  const lastIndexStr = props.getProperty('UNHIDE_LAST_INDEX');
  let startIndex = 1;
  
  if (lastIndexStr) {
    startIndex = parseInt(lastIndexStr, 10);
    Logger.log("Melanjutkan dari baris ke-" + startIndex + "...");
  } else {
    Logger.log("Mulai proses Unhide untuk " + (data.length - 1) + " Fasilitator dari awal...");
  }
  
  let sukses = 0;
  let gagal = 0;
  const startTime = Date.now();
  const TIME_LIMIT = 5 * 60 * 1000; // 5 menit sebagai batas aman
  
  // Looping mulai dari startIndex
  for (let i = startIndex; i < data.length; i++) {
    // Cek waktu eksekusi agar tidak terkena limit 6 menit
    if (Date.now() - startTime > TIME_LIMIT) {
      props.setProperty('UNHIDE_LAST_INDEX', i.toString());
      Logger.log(`\n=== WAKTU HAMPIR HABIS ===`);
      Logger.log(`Telah memproses ${sukses + gagal} file sebelum berhenti.`);
      Logger.log(`Silakan JALANKAN ULANG SCRIPT INI untuk melanjutkan dari baris ke-${i}!`);
      return;
    }
    
    const nama = data[i][namaColIdx];
    const url = data[i][urlColIdx];
    
    if (!url) continue;
    
    // Ekstrak ID dari URL
    const match = String(url).match(/[-\w]{25,}/);
    if (!match) continue;
    
    const spreadsheetId = match[0];
    
    try {
      const fasilSs = SpreadsheetApp.openById(spreadsheetId);
      const logSheet = fasilSs.getSheetByName("Log");
      
      if (logSheet) {
        // Tampilkan semua baris yang tersembunyi
        logSheet.showRows(1, logSheet.getMaxRows());
        sukses++;
        Logger.log(`[SUKSES] ${nama}`);
      } else {
        gagal++;
        Logger.log(`[GAGAL] ${nama} - Sheet 'Log' tidak ditemukan.`);
      }
    } catch (err) {
      gagal++;
      Logger.log(`[ERROR] ${nama} - ${err.message}`);
    }
    
    // Memberikan jeda kecil untuk menghindari limit Apps Script
    Utilities.sleep(50);
  }
  
  // Jika selesai semua, hapus penanda
  props.deleteProperty('UNHIDE_LAST_INDEX');
  
  Logger.log(`\n=== PROSES SELESAI SELURUHNYA ===`);
  Logger.log(`Berhasil Unhide: ${sukses}`);
  Logger.log(`Gagal/Error: ${gagal}`);
}
