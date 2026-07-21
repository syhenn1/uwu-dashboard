const SECRET_KEY = "UwU_Rahasia_123!"; // Samakan dengan yang di Next.js nanti

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // 1. Verifikasi Keamanan
    if (payload.secret !== SECRET_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const { hariKe, logNumber, rows } = payload;
    if (!hariKe || !logNumber || !rows || !rows.length) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid payload" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mlogSheet = ss.getSheetByName("masterLog");
    if (!mlogSheet) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Sheet masterLog tidak ditemukan" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Cari blok baris yang sudah ada untuk (Hari, Log) ini
    // Kita cari baris pertama yang cocok
    const data = mlogSheet.getDataRange().getValues();
    let startRow = -1;

    // Mulai dari baris 3 (karena baris 1-2 adalah header)
    for (let i = 2; i < data.length; i++) {
      const rowHari = data[i][2]; // Kolom C (Index 2) = Hari ke-
      const rowLog = data[i][1];  // Kolom B (Index 1) = Log ke-
      if (rowHari == hariKe && rowLog == logNumber) {
        startRow = i + 1; // Index array ke baris Google Sheet (1-based)
        break;
      }
    }

    // 3. Tentukan posisi Paste
    if (startRow === -1) {
      // Jika belum ada, buat blok baru di paling bawah
      startRow = Math.max(mlogSheet.getLastRow() + 1, 3);
    }

    // 4. Paste 390 baris sekaligus dalam 1 milidetik! (Sangat Cepat)
    // payload.rows berukuran [390][31] (390 baris, 31 kolom)
    mlogSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: `Berhasil menulis ${rows.length} baris di baris ke-${startRow}` }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ================================================================
 * FUNGSI PEMBERSIHAN SATU KALI (One-Time Cleanup)
 * ================================================================
 * Jalankan fungsi ini SATU KALI dari menu Apps Script untuk
 * membersihkan semua duplikat di masterLog.
 *
 * Logika: Untuk setiap kombinasi (Hari, Log, Nama Fasil),
 * hanya BARIS TERAKHIR (paling bawah) yang dipertahankan.
 * Semua baris duplikat di atasnya akan dihapus.
 *
 * CARA PAKAI:
 * 1. Buka Apps Script Editor
 * 2. Pilih fungsi "cleanupMasterLogDuplicates" dari dropdown
 * 3. Klik Run ▶
 * ================================================================
 */
function cleanupMasterLogDuplicates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("masterLog");
  if (!sheet) {
    Logger.log("Sheet masterLog tidak ditemukan!");
    return;
  }

  const data = sheet.getDataRange().getValues();
  Logger.log("Total baris di masterLog: " + data.length);

  // Pass 1: Untuk setiap (Hari, Log, NamaFasil), catat baris TERAKHIR (paling bawah)
  const lastSeen = {}; // key → index baris terakhir (0-based)
  for (let i = 2; i < data.length; i++) { // skip baris 1-2 (header)
    const namaFasil = (data[i][3] || "").toString().trim();
    const hari = data[i][2];
    const log  = data[i][1];
    if (!namaFasil || !hari) continue;
    const key = hari + "|" + log + "|" + namaFasil;
    lastSeen[key] = i; // yang terakhir ditemukan = yang paling bawah
  }

  // Pass 2: Tandai baris-baris yang BUKAN baris terakhir → hapus
  const rowsToDelete = []; // kumpulkan index (0-based)
  const seen = {};
  for (let i = 2; i < data.length; i++) {
    const namaFasil = (data[i][3] || "").toString().trim();
    const hari = data[i][2];
    const log  = data[i][1];
    if (!namaFasil || !hari) continue;
    const key = hari + "|" + log + "|" + namaFasil;

    if (seen[key]) {
      // Sudah pernah ketemu → ini duplikat. Tapi apakah ini yg terakhir?
      // Kita simpan yang terakhir (lastSeen), hapus sisanya
      if (i !== lastSeen[key]) {
        rowsToDelete.push(i);
      }
    } else {
      seen[key] = true;
      // Kalau ini bukan baris terakhir untuk key ini, tandai untuk dihapus
      if (i !== lastSeen[key]) {
        rowsToDelete.push(i);
      }
    }
  }

  Logger.log("Baris duplikat yang akan dihapus: " + rowsToDelete.length);

  if (rowsToDelete.length === 0) {
    Logger.log("Tidak ada duplikat! masterLog sudah bersih.");
    SpreadsheetApp.getUi().alert("✅ Tidak ada duplikat ditemukan. masterLog sudah bersih!");
    return;
  }

  // Pass 3: Hapus dari BAWAH ke ATAS agar index tidak bergeser
  rowsToDelete.sort(function(a, b) { return b - a; }); // descending
  for (let j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j] + 1); // +1 karena Sheets 1-based
  }

  Logger.log("Selesai! " + rowsToDelete.length + " baris duplikat dihapus.");
  SpreadsheetApp.getUi().alert(
    "🧹 Pembersihan Selesai!\n\n" +
    "Dihapus: " + rowsToDelete.length + " baris duplikat.\n" +
    "Sisa baris data: " + (data.length - 2 - rowsToDelete.length) + " baris."
  );
}
