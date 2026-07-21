import { getRosterEntries, extractSpreadsheetId, gvizCsvUrl } from './lib/masterSheet';
import { getTodayHari } from './lib/sheet';
import Papa from 'papaparse';
import logUpdate from 'log-update';

// Load env vars dari .env.local bawaan Next.js
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function runCli() {
  const args = process.argv.slice(2);
  const forceHari = args[0];
  const forceLog = args[1];

  if (!forceHari || !forceLog) {
    console.log("Usage: npx tsx cli-pull.ts <hariKe> <logKe>");
    process.exit(1);
  }

  const hariKe = parseInt(forceHari, 10);
  const logNumber = parseInt(forceLog, 10);
  const targetLabel = logNumber === 1 ? 'Log 1 di 07.00 WIB' : 'Log 2 di 13.30 WIB';

  console.log(`Mengunduh Roster Fasilitator...`);
  const roster = await getRosterEntries();
  if (roster.length === 0) {
    console.error("Gagal mendapatkan daftar fasilitator dari master sheet.");
    process.exit(1);
  }

  const payloadRows: (string|number|null)[][] = Array(roster.length).fill([]);
  const now = new Date();
  const offsetMs = 7 * 60 * 60 * 1000;
  const wibDate = new Date(now.getTime() + offsetMs);
  const dateStr = wibDate.toISOString().replace('T', ' ').substring(0, 19);

  let successCount = 0;
  let errorCount = 0;
  let processingCount = 0;

  function addLog(msg: string) {
    console.log(msg);
  }

  function renderUI() {
    // Dihapus karena log-update menyebabkan glitch di PowerShell Windows.
  }

  async function processWithConcurrency(items: typeof roster, maxConcurrent: number) {
    let index = 0;
    const promises: Promise<void>[] = [];

    const worker = async () => {
      while (index < items.length) {
        const currentIndex = index++;
        const entry = items[currentIndex];
        processingCount++;
        renderUI();

        let attempt = 0;
        let success = false;
        
        while (attempt < 3 && !success) {
          attempt++;
          try {
            if (!entry.urlLK) throw new Error('Tidak ada URL');
            const sid = extractSpreadsheetId(entry.urlLK);
            if (!sid) throw new Error('ID Spreadsheet tidak valid');
            
            // Tambahkan t=Date.now() agar Google Sheets tidak memberikan data cache yang basi!
            const url = gvizCsvUrl(sid, 'Log') + `&t=${Date.now()}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); 
            
            let res;
            try {
              res = await fetch(url, { cache: 'no-store', signal: controller.signal });
            } finally {
              clearTimeout(timeoutId);
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const csv = await res.text();
            
            const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: true });
            let foundRow: string[] | null = null;
            for (let i = 2; i < parsed.data.length; i++) {
              const row = parsed.data[i];
              if ((row[0] || '').trim() === targetLabel && parseInt((row[1] || '').trim(), 10) === hariKe) {
                foundRow = row;
                break;
              }
            }
            
            if (foundRow) {
              payloadRows[currentIndex] = [dateStr, logNumber, hariKe, entry.namaFasil, ...foundRow.slice(6, 6 + 27)];
              successCount++;
              addLog(`✅ [SUCCESS] ${entry.namaFasil}`);
            } else {
              errorCount++;
              addLog(`⚪ [KOSONG]  ${entry.namaFasil}`);
              payloadRows[currentIndex] = [dateStr, logNumber, hariKe, entry.namaFasil, ...Array(27).fill("")];
            }
            success = true;
          } catch (e: any) {
            if (attempt === 3) {
              errorCount++;
              addLog(`❌ [ERROR]   ${entry.namaFasil}: ${e.message}`);
              payloadRows[currentIndex] = [dateStr, logNumber, hariKe, entry.namaFasil, ...Array(27).fill("")];
              allErrors.push(`[${entry.namaFasil}] ${e.message}`);
            } else {
              addLog(`⚠️ [RETRY ${attempt}] ${entry.namaFasil}`);
              await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
            }
          }
        }
        
        processingCount--;
      }
    };

    for (let i = 0; i < maxConcurrent; i++) {
      promises.push(worker());
    }
    await Promise.all(promises);
  }

  // Gunakan variabel untuk menyimpan semua pesan error
  const allErrors: string[] = [];

  // Jalankan dengan 10 paralel agar Google tidak memblokir
  await processWithConcurrency(roster, 10);

  addLog(`\n====================================================`);
  addLog(`📊 HASIL AKHIR TAHAP PENARIKAN DATA:`);
  addLog(`✅ Berhasil Ditarik : ${successCount} fasilitator`);
  addLog(`⚪/❌ Kosong/Gagal   : ${errorCount} fasilitator`);
  addLog(`====================================================\n`);

  addLog(`🚀 Selesai menarik data. Mengirim ke Webhook...`);
  
  const webhookUrl = process.env.SYNC_WEBHOOK_URL;
  const webhookSecret = process.env.SYNC_SECRET_KEY;

  if (!webhookUrl || !webhookSecret) {
    addLog(`❌ ERROR: SYNC_WEBHOOK_URL atau SYNC_SECRET_KEY belum diatur di .env`);
    return;
  }

  try {
    const whRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: webhookSecret,
        hariKe,
        logNumber,
        rows: payloadRows
      })
    });
    
    const whData = await whRes.json();
    addLog(`🎉 WEBHOOK SUKSES: ${whData.message}`);
  } catch (e: any) {
    addLog(`❌ WEBHOOK GAGAL: ${e.message}`);
  }
  
  if (allErrors.length > 0) {
    console.log('\n\n--- DAFTAR ERROR KONEKSI LENGKAP ---');
    allErrors.forEach(err => console.log(err));
  }
}

runCli();
