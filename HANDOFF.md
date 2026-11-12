# HANDOFF — Lehnsherr von Eschenbrück

Übergabe für die nächste Sitzung. Überblick über das ganze Projekt: `PROJEKT.md`. Konzept: `KONZEPT.md`.

## Stand (2026-11-13, nach Runde 5)
- Git: `origin` = github.com/MP-E3N/The-Town, Branch `main`, Runde 5 committet und gepusht.
- Tests: `node tests/sim.test.js` → „ALLES GRUEN“ (≈ 8 s). Kluger Bot gewinnt 5/5 Karten an Tag 23–39.
- Nutzer hat zweimal gespielt: „guter Wuselfaktor“, „macht auf jeden Fall schon Laune“.
- Starten: Vorschau „lehnsherr“ (Port 5178) oder
  `powershell -ExecutionPolicy Bypass -File ..\serve.ps1 -Port 5178 -Root Lehnsherr` → http://localhost:5178 (`?seed=42`).

## Zu Beginn der nächsten Sitzung
1. `fehler.log` lesen (Browser-Fehler aus den Spieltests des Nutzers; Datei ist in `.gitignore`).
2. Bei Straßen/Gassen/Häusern/Markt: Skill `stadtplaner` benutzen, `LERNBUCH.md` lesen, mit `tools/stadtplan.mjs` messen.
3. Nutzer fragen: Wirken die Wege jetzt wie Trampelpfade? Sitzen Kirche und Burg richtig? Mauerbau mit Rasterpunkten
   bequem? (Runde 5 im Browser nur über simulierte Eingaben geprüft, nicht live mit der Maus gespielt.)

## Verlauf der Runden
### Runde 5 — Burg abseits, kleiner Markt, Kollision, Trampelpfade, Kirche, Mauerbau
Nutzerwunsch (6 Punkte, mit Bild „Kirche komplett falsch platziert“ direkt neben der Burg am Ufer):
- **Markt kleiner, Burg weit weg:** Platz 7,6×4,6 → 5,4×3,2 Kacheln. Burg liegt jetzt 17–23 Kacheln vom Markt
  (`sim/gelaende.js`: vom Fluss weg und schräg hinauf/hinab, x am Flusslauf auf Burghöhe gemessen). `LAND_RADIUS` 34 → 40.
  Erst Handelsstraße, dann Burgweg; `nurNeuerTeil()` (stadtplaner.js) schneidet ab, was schon auf Straße liegt →
  keine parallelen Doppelstraßen mehr, der Burgweg mündet als T in die Handelsstraße.
- **Kollision:** neues Raster `geh` in `sim/abgeleitet.js` (1 = Gebäude: 9 Probepunkte je Kachel, nicht nur Mitte;
  2 = Burghof, nur durch den Tordurchgang erreichbar) und `bruecke` (Wasser nur, wo die Brücke wirklich liegt).
  `pfad.js`: `begehbar()`, `naechsteBegehbare()`, `freieLinie()` mit Diagonal-Eckenprüfung. Kaserne/Burg sind nicht
  mehr „durchlaufbar“. `trennen()` (militaer.js) schiebt niemanden mehr in Häuser/Wasser. Ziel in einem Haus →
  nächste freie Kachel. Garnison steht im vorderen Burghof. Zuzügler laufen die Handelsstraße entlang (vorher quer).
- **Trampelpfade:** `render/szene.js` zeichnet Wege als Flächen mit je Seite eigenem Randrauschen + weicher,
  abgelaufener Randzone, ohne dunkle Kontur; Mittellinie fast gerade. Pflaster nur Hauptstraße im Kern und Gassen
  ganz oder gar nicht (keine grauen Flecken). Brücken breiter.
- **Kirche:** sucht Plätze 3,5–10,5 Kacheln um den Markt, Winkel 240–300° (ungefähr geostet), Portal ≤ 3 Kacheln
  von einer Straße, Abstand zu Wasser; Kirchhof im Sprite ohne Schattenkasten (`koerper` in sprites.js).
- **Mauern:** Jedes Stück speichert `ende` (Rasterpunkte). Werkzeug zeigt gelbe Punkte, rastet ein (grün);
  Wachtürme rasten auf Knoten ein und dürfen auf der Mauer stehen. Pfeiler an Mauerenden. Wo eine Straße die Mauer
  **quer** kreuzt (≥ 40°), entsteht ein **Torhaus** (3,0×1,5, zwei Flankentürme, Stein 1100 HP / Holz 450 HP);
  nur das nächstgelegene Stück, Tore werden zuletzt gerastert; Mauerstücke längs auf einem Weg werden ausgelassen.
- **Stellung beziehen:** Soldaten wählen + Rechtsklick auf Mauer/Torhaus/Turm (`aktion:'mauer'`): Plätze per
  Breitensuche entlang verbundener Stücke, Soldaten gehen zur Innenseite (Richtung Burg) und steigen hinauf
  (`u.mauerPlatz`). Oben: halber Schaden, Reichweite +1,5 (Bogen) / +0,5 (Speer), bleiben stehen. Neuer Befehl,
  „F“ oder zerstörtes Stück → steigen herab (Innenseite).
- **Angriffsmarker:** rote Nadel mit pulsierendem Ring über jedem Räubertrupp, kleiner roter Punkt über geplünderten
  Gebäuden, roter Pfeil am Bildrand (neben den Leisten), wenn die Räuber außerhalb des Bildes sind.
- **Bot:** wählt Gebiete jetzt nach Abstand zum Markt (vorher zur Burg → Äcker oben am Burgberg, Seed 99 verhungerte).
- Neue Tests: Kollision (0 von ~4600 Stichproben), Burg abseits, Torhaus, Durchgang, Rasterpunkte, Stellung + Herabsteigen.

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
- Seed 7: 0,51 Knicke je 10 Kacheln (Ziel ≤ 0,5). Torhaus über Feldwegen wirkt evtl. übertrieben (gleiches Torhaus).
- Räuber laufen um kurze Mauern herum (gewollt); kein „Tor schließen“. Mauerbesatzung bekommt keine eigene Anzeige.
- Speichern im Browser fehlt; Mühle/Bäcker, Kirche als 5. Bedürfnis, Markttage, Belagerung.
- Multiplayer: zweiter Herr mit eigener Burg, dann WebSocket-Lockstep (`netz/PROTOKOLL.md`).

## Debug
Browser-Konsole: `spiel.z` (Zustand), `spiel.v.senden({...})`, `spiel.vorspulen(n)`, `spiel.szene.stat` (Zeichenzeit),
`spiel.z.herren[0].planLog` (Baumeister). Überfall sofort: `spiel.z.naechsterUeberfall = spiel.z.tick + 1`.
Ausgeblendetes Vorschaufenster: `canvas.width/height` und `spiel.kamera.b/h` von Hand setzen, dann `spiel.vorspulen(0)`.
