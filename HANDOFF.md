# HANDOFF — Lehnsherr von Eschenbrück

Übergabe für die nächste Sitzung. Überblick über das ganze Projekt: `PROJEKT.md`. Konzept: `KONZEPT.md`.

## Stand (2026-11-12, nach Runde 4)
- Git: `origin` = github.com/MP-E3N/The-Town, Branch `main`, alles committet und gepusht.
- Tests: `node tests/sim.test.js` → „ALLES GRUEN“ (≈ 6 s). Kluger Bot gewinnt 5/5 Karten an Tag 24–37.
- Nutzer hat zweimal gespielt: „guter Wuselfaktor“, „macht auf jeden Fall schon Laune“.
- Starten: Vorschau „lehnsherr“ (Port 5178) oder
  `powershell -ExecutionPolicy Bypass -File ..\serve.ps1 -Port 5178 -Root Lehnsherr` → http://localhost:5178 (`?seed=42`).

## Zu Beginn der nächsten Sitzung
1. `fehler.log` lesen (Browser-Fehler aus den Spieltests des Nutzers; Datei ist in `.gitignore`).
2. Bei Straßen/Gassen/Häusern/Markt: Skill `stadtplaner` benutzen, `LERNBUCH.md` lesen, mit `tools/stadtplan.mjs` messen.
3. Nutzer nach dem Gefühl der Kamera fragen (Runde 4 hat sie direkter gemacht).

## Verlauf der Runden
### Runde 4 — Kamera direkter
- Nutzer: Zoom und WASD „zu schwammig, fühlt sich wie ein Delay an“.
- `render/kamera.js`: Zoom-Rate 14 → 30 (Ziel nach ~130 ms, Großteil in 50 ms), WASD Anfahren 10 → 24 / Bremsen 7 → 18
  (80 % Tempo nach 4 Bildern), Tempo 700 → 900 px/s, Flug zur Burg schneller, Zoom rastet früher ein.

### Runde 3 — Fehlerlog, Straßen, Rekrutieren
- **Fehlerlog:** `index.html` schickt Browser-Fehler per POST an `serve.ps1` → `fehler.log`. `serve.ps1` (liegt in
  `Projekte\`, gilt für alle Projekte) sendet außerdem `Cache-Control: no-store`.
- **Straßen:** Beläge Pflaster (Kern) / Kies (Handelsstraße außen) / Erde (Gassen), Feldwege mit Grasnarbe, Wegrand,
  blasse Radspuren, leichte natürliche Kurven (nur Optik), Brückengeländer, Hausgärten; offene Gassenenden werden an
  Nachbarstraßen angeschlossen; Zufahrten außerhalb des Wohnlands sind Feldwege.
- **Kamera:** weicher Zoom zum Mauszeiger (Touchpad-fähig), WASD mit Beschleunigung, H fliegt zur Burg.
- **Rekrutieren nur auf Befehl:** Burg/Kaserne anklicken → +1/+5 Speerträger/Bogenschützen (Warteschlange, leeren);
  „Automatisch auffüllen“ je Gebäude, Standard aus. Preis/Unterhalt im Infofenster und rechts unter „Militär“.
- **Tooltips** (`data-tipp`) für Ressourcen, Lager-Inhalt, Knöpfe. **Höfe wohnen mit** (Bauernhof 4, Viehhof 3).

### Runde 2 — Performance, Stadtplaner, Markt, Lager, RTS
- Bäume/Gras als vorgezeichnete Chunks (`render/deko.js`), Gelände im Leerlauf vorberechnet; 1920×1080 Zoom 14: 62 → 5 ms.
- Stadtplaner (`sim/stadtplaner.js`): begradigte Straßen, Wohngassen als T-Abzweig mit Blocktiefe, dichte Bebauung,
  Bürgerhäuser (8 Plätze) im Kern, Häuser mit Front zum Markt. Skill + Lernbuch + Messwerkzeug.
- Marktplatz als Straßenmarkt mit Ständen, Brunnen, Marktkreuz; Rathaus mit Laubengang; Kirche geostet.
- Lager je Gebäude (`sim/lager.js`), Umlagern; Speerträger + Bogenschützen; Schmiede wählbar; RTS-Steuerung.

### Runde 1 — Demo
Karte, Baumeister, Wirtschaft, 4 Bedürfnisse, Militär, Räuber, Jahreszeiten, prozedurale Grafik, Tests, Bots.

## Bekannte Schwächen / offen
- Nicht lange live mit der Maus gespielt (Vorschaufenster war oft ausgeblendet); Bedienung per simulierten Events geprüft.
- Seed 7: 0,51 scharfe Knicke je 10 Kacheln (Ziel ≤ 0,5) — vermutlich Hangstraßen am Burgberg (Lernbuch Runde 3).
- Dreiecksplätze an Gabelungen, Eckhäuser an Kreuzungen, Häuser in zweiter Reihe am Markt.
- Uferböschung recht breit; Burghof wirkt leer.
- Speichern im Browser fehlt; Mühle/Bäcker, Kirche als 5. Bedürfnis, Markttage, Belagerung.
- Multiplayer: zweiter Herr mit eigener Burg, dann WebSocket-Lockstep (`netz/PROTOKOLL.md`).

## Debug
Browser-Konsole: `spiel.z` (Zustand), `spiel.v.senden({...})`, `spiel.vorspulen(n)`, `spiel.szene.stat` (Zeichenzeit),
`spiel.z.herren[0].planLog` (Baumeister). Überfall sofort: `spiel.z.naechsterUeberfall = spiel.z.tick + 1`.
Ausgeblendetes Vorschaufenster: `canvas.width/height` und `spiel.kamera.b/h` von Hand setzen, dann `spiel.vorspulen(0)`.
