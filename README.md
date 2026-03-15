# 🚌 DPMB Brno – Odjezdová tabule

Digitální odjezdová tabule MHD Brno s GTFS daty od KORDIS JMK.

## ✨ Funkce
- Reálné jízdní řády DPMB (tramvaje, trolejbusy, autobusy, noční linky)
- Vyhledávání zastávek s autocomplete
- Odpočet do odjezdu, automatická obnova každých 30 s
- Přepínač témat: 👨 Dark LED / 👩 Hello Kitty pink

## 📦 Příprava před prvním nasazením

**GTFS data nejsou součástí tohoto repozitáře – musíš je přidat ručně:**

1. Stáhni `https://kordis-jmk.cz/gtfs/gtfs.zip`
2. Ulož soubor jako `data/gtfs.zip`
3. Commitni: `git add data/gtfs.zip && git commit -m "Add GTFS data"`

## 🚀 Nasazení na Vercel

1. Přidej `data/gtfs.zip` (viz výše)
2. Nahraj projekt na GitHub
3. Jdi na [vercel.com](https://vercel.com) → **New Project** → vyber repozitář
4. Framework preset: **Other**
5. Klikni **Deploy** – hotovo, žádná konfigurace

## 🔄 Aktualizace dat

GTFS data se mění každý týden. Postup aktualizace:
1. Stáhni nový `gtfs.zip` z `kordis-jmk.cz/gtfs/gtfs.zip`
2. Přepiš `data/gtfs.zip`
3. `git add data/gtfs.zip && git commit -m "Update GTFS" && git push`
4. Vercel se automaticky redeplojne

## 💻 Lokální spuštění

```bash
# 1. Přidej data/gtfs.zip (viz výše)
npm install
node server.js
# Otevři http://localhost:3000
```

## 📁 Struktura projektu

```
├── api/
│   ├── _gtfs.js        # GTFS loader (čte data/gtfs.zip)
│   ├── departures.js   # GET /api/departures?stop=...
│   ├── stops.js        # GET /api/stops?q=...
│   └── status.js       # GET /api/status
├── data/
│   └── gtfs.zip        # ← SEM PATŘÍ stažený soubor (není v repo)
├── public/
│   └── index.html      # Frontend
├── server.js           # Lokální dev server
├── vercel.json         # Vercel konfigurace
└── package.json
```
