# 🚌 DPMB Brno – Odjezdová tabule

Digitální odjezdová tabule MHD Brno s reálnými GTFS daty od KORDIS JMK.

## ✨ Funkce
- Reálné jízdní řády DPMB (tramvaje, trolejbusy, autobusy, noční linky)
- Vyhledávání zastávek s autocomplete
- Odpočet do odjezdu, automatická obnova každých 30 s
- Přepínač témat: 🌑 Dark LED / 🌸 Hello Kitty pink

## 🚀 Nasazení na Vercel

1. Nahraj projekt na GitHub
2. Jdi na [vercel.com](https://vercel.com) → **New Project** → vyber repozitář
3. Framework preset: **Other**
4. Klikni **Deploy** – hotovo

## 💻 Lokální spuštění

```bash
npm install
node server.js
# Otevři http://localhost:3000
```

## 📁 Struktura projektu

```
├── api/
│   ├── _gtfs.js        # GTFS loader (sdílený modul)
│   ├── departures.js   # GET /api/departures?stop=...
│   ├── stops.js        # GET /api/stops?q=...
│   └── status.js       # GET /api/status
├── public/
│   └── index.html      # Frontend (single page app)
├── server.js           # Lokální dev server
├── vercel.json         # Vercel konfigurace
└── package.json
```

## 📡 Data

GTFS data se stahují automaticky z `kordis-jmk.cz/gtfs/gtfs.zip` a cachují po dobu 6 hodin.
