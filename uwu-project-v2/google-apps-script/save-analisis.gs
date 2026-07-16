// Apps Script Web App (v2, TERPUSAT) - satu deployment untuk push balik hasil
// analisis AI ke SEMUA 30 spreadsheet LK fasilitator sekaligus (BUKAN 30
// deployment terpisah seperti rencana awal). Ini bisa dipakai karena admin
// (yang deploy script ini) sudah jadi Editor di ke-30 spreadsheet LK
// tersebut (dikonfirmasi 2026-07-16) - script yang di-deploy "Execute as: Me"
// jalan pakai akses Editor admin itu, jadi bisa buka & tulis ke spreadsheet
// manapun lewat SpreadsheetApp.openById(), tidak perlu nempel/dideploy dari
// tiap spreadsheet LK satu-satu.
//
// CARA DEPLOY (SEKALI SAJA, oleh admin):
//   1. Buka https://script.new - script BERDIRI SENDIRI (standalone), TIDAK
//      perlu dibuka dari salah satu spreadsheet LK atau dari spreadsheet
//      controller. spreadsheetId tujuan dikirim per item dari aplikasi
//      (lib/writeSheet.ts sudah resolve itu dari controller), jadi script
//      ini tidak perlu baca controller sendiri.
//   2. Hapus isi default Code.gs, tempel SELURUH isi file ini.
//   3. Ganti SAVE_ANALISIS_SECRET di bawah dengan string rahasia bikinanmu
//      sendiri (bebas, asal panjang & tidak gampang ditebak).
//   4. Klik Deploy > New deployment.
//      - Type: Web app
//      - Execute as: Me (WAJIB - supaya jalan pakai akses Editor-mu ke 30
//        spreadsheet itu, bukan akses siapa pun yang memicu tombol di
//        aplikasi)
//      - Who has access: Anyone
//   5. Klik Deploy, izinkan permission yang diminta (akses ke Drive-mu -
//      wajar, karena script ini memang perlu buka spreadsheet lain).
//   6. Salin "Web app URL" yang muncul - itu untuk WRITE_SHEETS_WEBHOOK_URL
//      di .env.local aplikasi (SATU URL untuk semua fasilitator). Isi juga
//      WRITE_SHEETS_WEBHOOK_SECRET (= SAVE_ANALISIS_SECRET di atas).
//
// Kalau nanti ubah kode ini, harus bikin "New deployment" lagi (atau "Manage
// deployments" > edit versi) supaya perubahan ke-apply ke URL yang sama.
//
// Struktur target di tiap spreadsheet LK (lihat uwu-project-v2/lib/sheet.ts
// untuk detail lengkap): tab "Isian" (label "Matriks" di salah satu sel),
// berisi tabel ringkasan Skor Akhir + tabel log harian terpisah ("Hari Ke -",
// "Tanggal", "Analisis" - kolom Analisis merge G:S). Tabel log harian dicari
// lewat ISI SEL ("Hari Ke" + "Analisis" ketemu di baris yang sama), BUKAN
// posisi baris/kolom tetap - supaya tahan kalau template sedikit beda antar
// fasilitator.
//
// DEBUG: buka URL Web App ini di browser (GET) + "?secret=SECRET_KAMU&spreadsheetId=ID_SPREADSHEET_LK"
// untuk lihat JSON diagnostik satu spreadsheet LK tertentu (semua tab yang
// ada, tabel log harian ketemu di tab mana, preview isinya).

var SAVE_ANALISIS_SECRET = "GANTI_DENGAN_SECRET_RAHASIA_MILIKMU";

function saveAnalisisNormalize(v) {
  return String(v == null ? "" : v).trim();
}

// Cari, di seluruh tab SATU spreadsheet, baris yang punya sel persis
// "Analisis" (header tabel log harian) DAN di baris yang sama ada sel yang
// diawali "Hari Ke" (mis. "Hari Ke -", tahan variasi spasi/tanda baca kecil).
function saveAnalisisFindLogTable(ss) {
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var values = sheet.getDataRange().getValues();
    for (var r = 0; r < values.length; r++) {
      var analisisCol = -1;
      var hariCol = -1;
      for (var c = 0; c < values[r].length; c++) {
        var cell = saveAnalisisNormalize(values[r][c]);
        if (cell === "Analisis") analisisCol = c;
        if (cell.indexOf("Hari Ke") === 0) hariCol = c;
      }
      if (analisisCol !== -1 && hariCol !== -1) {
        return { sheet: sheet, headerRow: r, hariCol: hariCol, analisisCol: analisisCol, values: values };
      }
    }
  }
  return null;
}

function doGet(e) {
  var secret = e.parameter.secret;
  if (secret !== SAVE_ANALISIS_SECRET) {
    return saveAnalisisJsonResponse({ error: 'Secret tidak cocok/belum diisi. Tambahkan "?secret=SECRET_KAMU" di ujung URL.' });
  }
  var spreadsheetId = e.parameter.spreadsheetId;
  if (!spreadsheetId) {
    return saveAnalisisJsonResponse({ error: 'Tambahkan "&spreadsheetId=ID_SPREADSHEET_LK" di URL untuk debug satu spreadsheet LK tertentu.' });
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    return saveAnalisisJsonResponse({ error: "Gagal buka spreadsheet (cek spreadsheetId, atau admin belum Editor di situ): " + String(err) });
  }

  var semuaTab = ss.getSheets().map(function (s) {
    return s.getName();
  });

  var found = saveAnalisisFindLogTable(ss);
  if (!found) {
    return saveAnalisisJsonResponse({
      error: 'Tidak ketemu tabel log harian (baris dengan sel "Analisis" DAN sel berawalan "Hari Ke" di baris yang sama) di tab manapun.',
      spreadsheetName: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      semuaTabYangAda: semuaTab,
    });
  }

  var previewBaris = [];
  var start = Math.max(0, found.headerRow);
  var end = Math.min(found.values.length, found.headerRow + 8);
  for (var r = start; r < end; r++) {
    previewBaris.push({
      baris: r + 1,
      hariKe: JSON.stringify(found.values[r][found.hariCol]),
      analisis: JSON.stringify(found.values[r][found.analisisCol]),
    });
  }

  return saveAnalisisJsonResponse({
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    semuaTabYangAda: semuaTab,
    tabDipakai: found.sheet.getName(),
    headerRowDitemukanDiBaris: found.headerRow + 1,
    hariKeKolom: found.hariCol + 1,
    analisisKolom: found.analisisCol + 1,
    previewBarisLogHarian: previewBaris,
  });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SAVE_ANALISIS_SECRET) {
      return saveAnalisisJsonResponse({ error: "Secret tidak cocok." });
    }

    var items = body.items;
    if (!items || !items.length) {
      return saveAnalisisJsonResponse({ error: "items kosong." });
    }

    // Kelompokkan per spreadsheetId supaya tiap spreadsheet LK cuma dibuka
    // SEKALI walau ada beberapa Hari yang ditulis untuk fasilitator yang sama.
    var bySpreadsheet = {};
    items.forEach(function (item) {
      var key = item.spreadsheetId;
      if (!bySpreadsheet[key]) bySpreadsheet[key] = [];
      bySpreadsheet[key].push(item);
    });

    var updated = 0;
    var notFound = [];

    Object.keys(bySpreadsheet).forEach(function (spreadsheetId) {
      var groupItems = bySpreadsheet[spreadsheetId];
      var label = groupItems[0].kodeFasil || spreadsheetId;

      var ss;
      try {
        ss = SpreadsheetApp.openById(spreadsheetId);
      } catch (err) {
        groupItems.forEach(function (item) {
          notFound.push(label + " Hari " + item.hari + " (gagal buka spreadsheet: " + String(err) + ")");
        });
        return;
      }

      var found = saveAnalisisFindLogTable(ss);
      if (!found) {
        groupItems.forEach(function (item) {
          notFound.push(label + " Hari " + item.hari + " (tabel log harian tidak ketemu di spreadsheet ini)");
        });
        return;
      }

      groupItems.forEach(function (item) {
        var rowFound = false;
        for (var r = found.headerRow + 1; r < found.values.length; r++) {
          var rowHariRaw = saveAnalisisNormalize(found.values[r][found.hariCol]);
          var rowHari = parseInt(rowHariRaw, 10);
          if (!isNaN(rowHari) && rowHari === item.hari) {
            found.sheet.getRange(r + 1, found.analisisCol + 1).setValue(item.hasil);
            updated++;
            rowFound = true;
            break;
          }
        }
        if (!rowFound) notFound.push(label + " Hari " + item.hari + " (baris Hari ke- itu tidak ketemu di tabel log harian)");
      });
    });

    return saveAnalisisJsonResponse({ ok: true, updated: updated, notFound: notFound });
  } catch (err) {
    return saveAnalisisJsonResponse({ error: String(err) });
  }
}

function saveAnalisisJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
