# uwu-project (monorepo)

npm workspaces monorepo untuk dashboard monitoring fasilitator program revitalisasi
sekolah - dua versi aplikasi berbagi satu package analisis/LLM.

```
uwu-project/
├── uwu-project-v1/    # app awal - sumber data: 1 tab "Level Fasil" gabungan
├── uwu-project-v2/    # app baru - sumber data: 30 LK Fasil individual + spreadsheet
│                      #            controller (lihat uwu-project-v2/README.md)
└── packages/
    └── core/          # logika analisis + prompt + panggilan LLM, dipakai v2
                        # (v1 belum dimigrasi ke sini, lihat catatan di uwu-project-v2/README.md)
```

## Cara jalan

```bash
npm install              # sekali saja, di root - meng-install untuk semua workspace
npm run dev:v1           # http://localhost:3000
npm run dev:v2           # tambahkan `-- -p 3001` kalau mau jalan bareng v1
npm run build:v1
npm run build:v2
```

Detail konfigurasi (`.env.local`), arsitektur data, dan status implementasi tiap app ada di
README masing-masing: [uwu-project-v1/README.md](uwu-project-v1/README.md),
[uwu-project-v2/README.md](uwu-project-v2/README.md).
