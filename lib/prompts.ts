import { activeCheckpoints, buildKnowledgeSummary } from "./knowledge/checkpoints";
import { KEY_TO_HEADER } from "./columns";
import { getEffectiveRisk, summarizeDay } from "./metrics";
import { getCheckpointCompliance, countNonCompliant } from "./compliance";
import type { CheckpointCompliance } from "./compliance";
import { QUALITATIVE_FIELDS } from "./notes";
import type { FacilRow } from "./types";
import type { ChatMessage } from "./llm";
import { TIER_LABEL, TIER_RANK, indicatorSeverity } from "./severity";
import type { SeverityTier } from "./severity";

const SYSTEM_PROMPT = `Anda adalah asisten analis untuk program revitalisasi sekolah. Tugas Anda menganalisis data
kinerja fasilitator lapangan berdasarkan Lembar Kerja (LK) dan aplikasi monitoring ("Aplikasi Revit"),
lalu memberi kesimpulan yang jujur dan actionable kepada admin program.

Aturan penting:
- Data berupa persentase "masalah" (mis. "% Sekolah Belum Login Aplikasi") - semakin TINGGI nilainya semakin BURUK.
- "Nilai Risiko" adalah skor terbobot 0-100% (semakin tinggi = semakin berisiko), dihitung dari checkpoint-checkpoint yang diberikan. Kalau ditandai "(estimasi)", berarti kolom itu kosong di sheet dan dihitung otomatis oleh aplikasi dari bobot checkpoint - sebut ke pembaca bahwa angka itu estimasi, bukan hasil resmi sheet.
- JANGAN menyalahkan fasilitator untuk checkpoint yang belum berlaku pada hari tsb (lihat catatan "belum relevan" di data).
- Jika ada "Catatan Admin" yang sudah ditulis manusia, jadikan itu konteks tambahan - jangan diulang mentah-mentah, tapi boleh dikonfirmasi/dipertajam. Kolom "Analisis" sengaja TIDAK diikutkan sebagai konteks - itu tempat menyimpan hasil analisis AI ini sendiri (lewat fitur "Tambahkan ke Spreadsheet"), supaya tiap analisis baru murni dari data terkini, bukan menggemakan hasil analisis lama.
- Perhatikan pola anomali: data yang sama sekali tidak berubah selama beberapa hari berturut-turut sering menandakan fasilitator berhenti mengisi laporan, bukan kondisi yang benar-benar stabil.
- Kolom bersumber "LK Fasil" yang terbaca 0% masalah atau "Sudah" TIDAK OTOMATIS berarti kondisinya baik - itu bisa jadi cuma default kosong di sheet kalau fasilitator belum login LK sama sekali, atau catatan "Kendala..." terkait menyebut "belum diisi". Selalu silangkan dengan status "Fasil Belum Login LK" dan catatan Kendala terkait sebelum menyimpulkan sesuatu "aman" - jangan tertipu angka 0% yang sebenarnya berarti "belum ada data", bukan "sudah terverifikasi baik".
- Data yang dianalisis selalu terdiri dari dua jenis, dan JANGAN dicampur jadi satu poin: (1) data KUANTITATIF - Nilai Risiko, persentase checkpoint, status kepatuhan; (2) data KUALITATIF - catatan bebas seperti Kendala/Analisis Admin/Catatan Admin dari lapangan. Kalau diminta membahas keduanya, tulis sebagai dua bagian terpisah, bukan digabung dalam satu kalimat.
- Kalau diberi bagian "Perbandingan dengan Hari Sebelumnya", pakai itu apa adanya untuk merefleksikan perubahan (naik/turun/berubah status) - JANGAN mengarang perubahan yang tidak ada di data itu. Kalau bagian itu bilang tidak ada data pembanding (mis. Hari 1) atau tidak ada yang berubah, sampaikan itu apa adanya.
- Setiap indikator checkpoint di data sudah dilabeli tingkat keparahan mengikuti acuan admin: Hijau (tidak perlu tindakan), Kuning (monitoring), Oranye (tindak lanjut oleh koordinator), Merah (eskalasi ke pusat/pembinaan intensif). Pakai label ini APA ADANYA saat menyebut urgensi suatu masalah - JANGAN menilai tingkat keparahan sendiri di luar label yang sudah diberikan di data.
- Jawab dalam Bahasa Indonesia. Ikuti persis format/bagian yang diminta (termasuk judul bagian kalau ada) - isi tiap poin dalam bentuk SATU kalimat ringkas, tanpa sub-bullet, tanpa paragraf penjelasan tambahan, tanpa pembuka/penutup di luar yang diminta.
- JANGAN pakai label/judul tebal (format "**Kata Kunci**:") di depan tiap poin, dan jangan sekadar mengisi template kaku - tulis tiap kalimat mengalir natural, seolah manusia yang buru-buru mengetik catatan singkat, bukan laporan AI yang formal.`;

/** QUALITATIVE_FIELDS tanpa "analisis" - dipakai khusus untuk konteks yang
 * dikirim ke LLM (lihat catatan di SYSTEM_PROMPT soal kenapa kolom itu
 * dikecualikan). Tampilan UI (halaman detail fasilitator, chart aktivitas)
 * tetap pakai QUALITATIVE_FIELDS penuh dari lib/notes.ts. */
const PROMPT_QUALITATIVE_FIELDS = QUALITATIVE_FIELDS.filter((f) => f.key !== "analisis");

function formatCell(v: FacilRow[keyof FacilRow]): string {
  if (v == null) return "-";
  if (typeof v === "number") return `${v}%`;
  return String(v);
}

function formatRisk(row: FacilRow): string {
  const risk = getEffectiveRisk(row);
  if (risk.value == null) return "-";
  return `${risk.value.toFixed(1)}%${risk.estimated ? " (estimasi)" : ""}`;
}

function buildHistoryTable(history: FacilRow[], maxDay: number): string {
  const groups = activeCheckpoints(maxDay);
  const cols = groups.flatMap((g) => g.indicators.map((i) => i.kolom));
  const uniqueCols = Array.from(new Set(cols));

  const header = ["Hari", "Nilai Risiko", ...uniqueCols].join(" | ");
  const sep = uniqueCols.map(() => "---").join(" | ");
  const rows = history.map((row) => {
    const cells = uniqueCols.map((c) => (row.hari >= (groups.find((g) => g.indicators.some((i) => i.kolom === c))?.activeFromDay ?? 0) ? formatCell(row[c]) : "(belum berlaku)"));
    return [`Hari ${row.hari}`, formatRisk(row), ...cells].join(" | ");
  });

  return [header, `--- | --- | ${sep}`, ...rows].join("\n");
}

function formatDelta(prev: number, curr: number): string {
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) return "tetap";
  return diff > 0 ? `naik ${diff.toFixed(1)} poin` : `turun ${Math.abs(diff).toFixed(1)} poin`;
}

/** Bandingkan satu fasilitator antara Hari ke-N (currentRow) dan Hari ke-(N-1)
 * (dicari di `history`, BUKAN sekadar elemen sebelum-terakhir - supaya tetap
 * benar walau ada hari yang datanya bolong). Dipakai supaya analisis per
 * fasilitator eksplisit "merefleksikan" perubahan dari hari sebelumnya,
 * bukan cuma menampilkan tabel tren mentah dan berharap LLM menyimpulkan sendiri. */
function buildFacilitatorDayDiff(history: FacilRow[], currentRow: FacilRow, hari: number): string {
  if (hari <= 1) return "(Hari ke-1 - belum ada hari sebelumnya untuk dibandingkan.)";
  const prevRow = history.find((r) => r.hari === hari - 1);
  if (!prevRow) return `(Tidak ada data Hari ke-${hari - 1} untuk dibandingkan.)`;

  const lines: string[] = [];
  const prevRisk = getEffectiveRisk(prevRow).value;
  const currRisk = getEffectiveRisk(currentRow).value;
  if (prevRisk != null && currRisk != null) {
    lines.push(`- Nilai Risiko: ${prevRisk.toFixed(1)}% -> ${currRisk.toFixed(1)}% (${formatDelta(prevRisk, currRisk)}).`);
  } else {
    lines.push(`- Nilai Risiko: tidak bisa dibandingkan (salah satu/kedua hari belum punya data cukup).`);
  }

  const cols = activeCheckpoints(hari).flatMap((g) => g.indicators.map((i) => i.kolom));
  const uniqueCols = Array.from(new Set(cols));
  const changed: string[] = [];
  for (const col of uniqueCols) {
    const prevVal = prevRow[col];
    const currVal = currentRow[col];
    if (prevVal !== currVal) {
      const label = KEY_TO_HEADER[col] ?? String(col);
      changed.push(`${label}: ${formatCell(prevVal)} -> ${formatCell(currVal)}`);
    }
  }
  lines.push(
    changed.length > 0
      ? `- Kolom checkpoint yang berubah dari kemarin: ${changed.join("; ")}.`
      : `- Tidak ada satupun kolom checkpoint numerik yang berubah dari kemarin (indikasi data belum diupdate ulang).`
  );
  return lines.join("\n");
}

/** Versi agregat buildFacilitatorDayDiff untuk ringkasan SELURUH fasilitator -
 * membandingkan statistik hari ini vs kemarin (rata-rata risiko, jumlah
 * fasilitator risiko tinggi/belum login/checkpoint belum sesuai). */
function buildOverallDayDiff(dayRows: FacilRow[], prevDayRows: FacilRow[], hari: number): string {
  if (hari <= 1) return "(Hari ke-1 - belum ada hari sebelumnya untuk dibandingkan.)";
  if (prevDayRows.length === 0) return `(Tidak ada data Hari ke-${hari - 1} untuk dibandingkan.)`;

  const today = summarizeDay(dayRows);
  const yesterday = summarizeDay(prevDayRows);
  const todayNonCompliant = dayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari)) > 0).length;
  const yesterdayNonCompliant = prevDayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari - 1)) > 0).length;

  const lines: string[] = [];
  if (today.avgRisiko != null && yesterday.avgRisiko != null) {
    lines.push(`- Rata-rata Nilai Risiko: ${yesterday.avgRisiko.toFixed(1)}% -> ${today.avgRisiko.toFixed(1)}% (${formatDelta(yesterday.avgRisiko, today.avgRisiko)}).`);
  } else {
    lines.push(`- Rata-rata Nilai Risiko: tidak bisa dibandingkan (data belum cukup di salah satu hari).`);
  }
  lines.push(`- Fasilitator risiko tinggi: ${yesterday.tinggiCount} orang -> ${today.tinggiCount} orang.`);
  lines.push(`- Fasilitator belum login LK: ${yesterday.belumLogin} orang -> ${today.belumLogin} orang.`);
  lines.push(`- Fasilitator dengan checkpoint belum sesuai: ${yesterdayNonCompliant} orang -> ${todayNonCompliant} orang.`);
  return lines.join("\n");
}

/** Status checkpoint TERKINI (hasil getCheckpointCompliance, yang sudah
 * memperhitungkan downgrade trust/mismatch di lib/compliance.ts) - dikasih
 * eksplisit ke LLM supaya "checkpoint mana yang belum tercapai" disebut dari
 * status resmi aplikasi, bukan LLM menghitung ulang sendiri dari tabel angka
 * mentah (yang tidak tahu soal distrust 0%/kendala kontradiktif). Tiap
 * indikator (gating maupun info) juga dilabeli tingkat keparahan (lihat
 * classifySeverity) supaya LLM tidak menilai urgensi sendiri dari angka
 * mentah, DAN supaya bisa jelaskan kalau status Belum Sesuai/Merah ternyata
 * didorong oleh satu indikator gating (mis. checkpoint 7 "Dapodik sesuai
 * kebutuhan") yang jauh lebih buruk dari indikator info lain di checkpoint
 * yang sama yang terlihat baik-baik saja - bukan cuma menyebut satu angka
 * yang keliatan kontradiktif. */
function buildCheckpointStatusSummary(compliance: CheckpointCompliance[]): string {
  if (compliance.length === 0) return "(belum ada checkpoint yang jatuh tempo hari ini)";
  return compliance
    .map(({ group, status, indicators }) => {
      const label = status === "sesuai" ? "Sesuai" : status === "belum-sesuai" ? "Belum Sesuai" : "Tidak Ada Data";
      // Sertakan juga indikator info (bobot 0) di samping yang gating - satu
      // checkpoint bisa punya indikator "info" yang terlihat baik TAPI status
      // tetap Belum Sesuai/Merah karena indikator gating lain jauh lebih buruk.
      // LLM perlu lihat KEDUANYA supaya bisa jelaskan alasan sebenarnya, bukan
      // cuma nyebut satu angka yang keliatan kontradiktif dengan status di atasnya.
      const detail = indicators
        .map((i) => {
          const sev = indicatorSeverity(i, group);
          const tierTag = sev ? ` [${TIER_LABEL[sev.tier]} - ${sev.aksi}]` : "";
          const gatingTag = i.gating ? "" : " (info, tidak menggerakkan status)";
          return `${i.label}: ${i.detail}${tierTag}${gatingTag}`;
        })
        .join("; ");
      return `- [${group.no}. ${group.name}] ${label} - ${detail}`;
    })
    .join("\n");
}

function buildQualitativeNotes(history: FacilRow[]): string {
  const lines: string[] = [];
  for (const row of history) {
    for (const field of PROMPT_QUALITATIVE_FIELDS) {
      const value = row[field.key];
      if (typeof value === "string" && value.trim() !== "" && value !== "Belum Diisi") {
        lines.push(`- Hari ${row.hari} - ${field.label}: ${value}`);
      }
    }
  }
  return lines.length ? lines.join("\n") : "(tidak ada catatan kualitatif tambahan)";
}

export function buildFacilitatorAnalysisMessages(history: FacilRow[]): ChatMessage[] {
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  const maxDay = history[history.length - 1].hari;
  const latest = history[history.length - 1];
  const compliance = getCheckpointCompliance(latest, maxDay);

  const userPrompt = `Fasilitator: ${latest.namaFasil} (${latest.kodeFasil})
Koordinator: ${latest.namaKoor} (${latest.kodeKoor})
Data tersedia sampai Hari ke-${maxDay} dari siklus 14 hari.

## Basis Pengetahuan Checkpoint (kolom, bobot, definisi)
${buildKnowledgeSummary(maxDay)}

## Status Checkpoint Saat Ini (per Hari ke-${maxDay})
${buildCheckpointStatusSummary(compliance)}

## Tabel Tren Harian
${buildHistoryTable(history, maxDay)}

## Perbandingan dengan Hari Sebelumnya (Hari ke-${maxDay - 1})
${buildFacilitatorDayDiff(history, latest, maxDay)}

## Catatan Kualitatif (Kendala / Analisis / Catatan Admin yang sudah ada)
${buildQualitativeNotes(history)}

Tolong tulis 5 poin berurutan, TANPA label/judul di depan tiap poin - langsung isi kalimatnya, natural seperti manusia menulis catatan singkat. Poin 1, 2, 4, 5 masing-masing satu kalimat ringkas (maksimal ~25 kata). Poin 3 BOLEH lebih dari satu kalimat kalau checkpoint yang Belum Sesuai ada banyak - JANGAN mengorbankan kejelasan demi memaksakan satu kalimat:
1. Bagaimana kinerjanya - bagus/cukup/butuh perhatian, dan kenapa.
2. Apa yang berubah dibanding Hari ke-${maxDay - 1} (pakai bagian "Perbandingan dengan Hari Sebelumnya" di atas).
3. Checkpoint mana saja yang berstatus Belum Sesuai (pakai bagian "Status Checkpoint Saat Ini"). Untuk SETIAP checkpoint yang disebut, WAJIB sertakan nama indikator spesifik dan angkanya yang bikin gagal - DILARANG cuma menulis "NamaCheckpoint (Tingkat)" tanpa keterangan indikator (mis. jangan tulis "Dokumen admin sesuai (Merah)" - tulis "Dokumen admin sesuai (Merah - % Sekolah Dok. Admin Sesuai: 0%)"). Kalau semua checkpoint yang jatuh tempo Sesuai, bilang tidak ada red flag.
4. Pola mencurigakan paling menonjol, atau bilang tidak ada anomali kalau memang tidak ada.
5. Satu tindakan paling penting untuk admin/koordinator, sesuaikan urgensinya dengan tingkat keparahan yang ada.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

export function buildDailySummaryMessages(dayRows: FacilRow[], hari: number, prevDayRows: FacilRow[] = []): ChatMessage[] {
  if (dayRows.length === 0) throw new Error("Tidak ada data untuk hari ini.");
  const sorted = [...dayRows].sort((a, b) => {
    const av = getEffectiveRisk(a).value ?? -1;
    const bv = getEffectiveRisk(b).value ?? -1;
    return bv - av;
  });

  const table = sorted
    .map((r) => {
      const belumSesuai = getCheckpointCompliance(r, hari)
        .filter((c) => c.status === "belum-sesuai")
        .map((c) => {
          let worst: { label: string; detail: string; tier: SeverityTier } | null = null;
          for (const i of c.indicators) {
            if (!i.gating) continue;
            const sev = indicatorSeverity(i, c.group);
            if (sev && (worst == null || TIER_RANK[sev.tier] > TIER_RANK[worst.tier])) {
              worst = { label: i.label, detail: i.detail, tier: sev.tier };
            }
          }
          return worst ? `${c.group.name} [${TIER_LABEL[worst.tier]} - ${worst.label}: ${worst.detail}]` : c.group.name;
        });
      const cpNote = belumSesuai.length > 0 ? `, Checkpoint belum sesuai: ${belumSesuai.join(", ")}` : ", Checkpoint belum sesuai: tidak ada";
      return `- ${r.namaFasil} (${r.kodeFasil}, koor: ${r.namaKoor}) - Nilai Risiko: ${formatRisk(r)}, Belum Login LK: ${formatCell(r.fasilBelumLoginLK)}, Belum Login Aplikasi: ${formatCell(r.pctSekolahBelumLoginAplikasi)}${cpNote}`;
    })
    .join("\n");

  const notes = dayRows
    .flatMap((r) =>
      PROMPT_QUALITATIVE_FIELDS.filter((f) => {
        const v = r[f.key];
        return typeof v === "string" && v.trim() !== "" && v !== "Belum Diisi";
      }).map((f) => `- ${r.namaFasil}: [${f.label}] ${r[f.key]}`)
    )
    .join("\n");

  const userPrompt = `Ringkasan seluruh fasilitator (${dayRows.length} orang) pada Hari ke-${hari} dari siklus 14 hari.

## Basis Pengetahuan Checkpoint yang Relevan Hari Ini
${buildKnowledgeSummary(hari)}

## Data Kuantitatif per Fasilitator (Nilai Risiko & checkpoint, diurutkan dari risiko tertinggi)
${table}

## Data Kualitatif dari Lapangan (catatan Kendala/Analisis Admin/Catatan Admin)
${notes || "(tidak ada catatan kualitatif tambahan)"}

## Perbandingan dengan Hari Sebelumnya (Hari ke-${hari - 1})
${buildOverallDayDiff(dayRows, prevDayRows, hari)}

Tolong tulis dalam format tiga bagian di bawah, TANPA label/judul di depan tiap kalimat - langsung isi kalimatnya, natural seperti manusia menulis catatan singkat (judul "##" section boleh tetap dipakai apa adanya). Poin 1, 3, 4, 5, 6 masing-masing satu kalimat ringkas (maksimal ~25 kata). Poin 2 BOLEH lebih dari satu kalimat kalau fasilitator prioritas itu punya banyak checkpoint Belum Sesuai - JANGAN mengorbankan kejelasan demi memaksakan satu kalimat:

## Analisis Kuantitatif
1. Gambaran keseluruhan kinerja hari ini berdasar Nilai Risiko & status checkpoint.
2. Siapa yang paling butuh perhatian/intervensi segera. Untuk SETIAP checkpoint Belum Sesuai yang disebut, WAJIB pakai catatan "Checkpoint belum sesuai" di data APA ADANYA (nama indikator + angka + tingkat keparahannya) - DILARANG cuma menulis "NamaCheckpoint (Tingkat)" tanpa keterangan indikator.
3. Apa yang membaik/memburuk dibanding Hari ke-${hari - 1} (pakai bagian "Perbandingan dengan Hari Sebelumnya" di atas).

## Analisis Kualitatif
4. Kendala paling menonjol yang berulang di banyak fasilitator, atau bilang tidak ada pola kendala umum kalau memang tidak ada.
5. Hal penting lain dari catatan lapangan yang belum tercakup di poin 4, atau bilang tidak ada catatan tambahan kalau memang tidak ada.

## Rekomendasi
6. Satu tindakan paling penting untuk hari ini/besok, sesuaikan urgensinya dengan tingkat keparahan checkpoint yang ada, mempertimbangkan analisis kuantitatif maupun kualitatif di atas.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}
