# BaZi Profiles

A single-page BaZi (Four Pillars) tool: one chart with plain-English readings, and love and work compatibility between two people. Every reading line has a **Why** link to the pillars it comes from.

This repo holds **code only**. It contains no personal data. Profiles live in a separate **private** repo and sync through a token that each device keeps in its own browser.

## Put the app on GitHub Pages

1. Create a repo for the code, for example `bazi-profiles`. Free GitHub Pages needs it to be public; that is fine, because no profiles are stored here.
2. Upload these files to the repo root: `index.html` (Banana English + 中文, and English), `zh.html` (the 中文 version, loaded only when chosen), `sw.js`, `manifest.webmanifest`, the four icon PNGs (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`), this README, the licence file and `BaZi-Profiles-Guide.pdf`. Keep the source in a `src/` folder if you like; Pages ignores it.
3. Repo **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)**. Save.
4. After a minute the app is at `https://<your-username>.github.io/bazi-profiles/`.

## Install it like an app

Open the Pages address on your phone, then:

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app**, or use the **Install app** button in Settings.

The installed app opens full screen and works offline. GitHub sync catches up when you are back online. After you upload a new `index.html`, upload the matching `zh.html` and `sw.js` from the same build too; the app picks them up the next time it opens online.

## Sync your profiles across devices

1. Create a second repo, **private**, for example `bazi-data`. Leave it empty.
2. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories** → `bazi-data` only.
   - Repository permissions: **Contents → Read and write**. Nothing else.
   - Pick an expiry (for example one year).
3. Open the app → **Settings → Sync across devices**. Enter your username, `bazi-data`, and the token. Tap **Connect and sync**.
4. Repeat step 3 on each device (phone, laptop, tablet). They all read and write `profiles.json` in `bazi-data`.

How sync behaves:

- It syncs when the app opens, a few seconds after every change, when you come back to the tab, and every 5 minutes.
- Merging is per person: when the same person was edited on two devices, the newer edit wins. Deletions sync too.
- The token is stored only in that device's browser, and only if **Remember the token** is ticked. Untick it on a shared computer.
- The page is locked so it can only talk to `api.github.com` (Content-Security-Policy), so the token cannot be sent anywhere else.
- Lost a device? Delete the token on GitHub and make a new one for your other devices.

## What is stored

Per person: nickname (not a full name), birth date, birth time or "unknown", gender, birth place (name, time zone, longitude), notes, and edit times. Charts are recalculated every time; they are never stored.

**Settings → Backup** exports a dated `bazi-profiles-YYYY-MM-DD.json`, and imports one with **Merge** or **Replace**. **Settings → Delete all data** removes everything on this device, or everywhere including the synced file.

## How the calculation is checked

The source (`src/`) has test suites that run on every change, plus an optional cross-check against an independent engine. Latest results:

- 3,000 random births compared with lunar-javascript and tyme4ts: pillars, hidden stems, ten gods and luck pillars all match.
- 2,000 random births in 8 time zones compared with [Stillness Dao's bazi-engine](https://github.com/David88666/bazi-engine) (MIT), which works from solar positions independently: pillars 2,000 / 2,000 (and 409 / 409 late-Rat-hour births with the same-day rule), first luck pillar, Nayin, fetal origin, void branches and life stages all 2,000 / 2,000.
- Luck **start age** matched bazi-engine in only 901 / 2,000 births, usually by about ten years. Both use the same 3-days-to-1-year rule, and this app agrees with lunar-javascript and tyme4ts, so the gap looks like bazi-engine picking a different solar term in some cases.

## Credits and licence

Pillars are cross-checked against [bazi-engine](https://github.com/David88666/bazi-engine) by Stillness Dao (MIT); no code from it is bundled. Calendar maths (solar terms, the sexagenary day cycle) comes from [lunar-javascript](https://github.com/6tail/lunar-javascript) by 6tail, MIT licence (see `LICENSE-lunar-javascript.txt`), bundled inside `index.html`. Reading rules and wording are original to this project. Compatibility scores use the author's own weighting and are a guide, not a verdict.
