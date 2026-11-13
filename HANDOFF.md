# HANDOFF — Lehnsherr von Eschenbrück

Übergabe für die nächste Sitzung. Überblick über das ganze Projekt: `PROJEKT.md`. Konzept: `KONZEPT.md`.

## Stand (2026-11-13, nach Runde 8)
- Git: `origin` = github.com/MP-E3N/The-Town, Branch `main`. Runden 6, 7 und 8 in EINEM Commit (2026-11-13) committet
  und gepusht (vorher Runde 5: f0c2b30). Nutzer hat Runden 6–8 noch nicht selbst gespielt.
- Tests: `node tests/sim.test.js` → „ALLES GRUEN“ (≈ 5 s). Kluger Bot gewinnt 5/5 Karten an Tag 20–28. 49 Prüfungen.
  „Nichtstun“ verliert seit Runde 7 nicht mehr (größere Startfelder), gewinnt aber nicht.
- Nutzer hat zweimal gespielt: „guter Wuselfaktor“, „macht auf jeden Fall schon Laune“.
- Starten: Vorschau „lehnsherr“ (Port 5178) oder
  `powershell -ExecutionPolicy Bypass -File ..\serve.ps1 -Port 5178 -Root Lehnsherr` → http://localhost:5178 (`?seed=42`).

## Zu Beginn der nächsten Sitzung
1. `fehler.log` lesen (Browser-Fehler aus den Spieltests des Nutzers; Datei ist in `.gitignore`).
2. Bei Straßen/Gassen/Häusern/Markt: Skill `stadtplaner` benutzen, `LERNBUCH.md` lesen, mit `tools/stadtplan.mjs` messen.
3. Nutzer fragen (Runde 8): Stehen Tore jetzt richtig? Schließen die Mauertürme am Wasser die Lücke? Gefallen die
   Häuserzeilen mit Zwischenstücken? Ist der Steinwurf von der Mauer stark genug (KAMPF.steinwurf)?
   Hinweis: Runde 8 im Browser meist bei ausgeblendetem Vorschaufenster geprüft (Tests + Fehlerfreiheit), Bild nur teils.
4. Nutzer fragen (Runde 7): Gefallen Straßenbild, Marktübergänge und Flickenteppich-Felder? Sind es jetzt
   wenig genug Straßen? Heilen die Soldaten spürbar?
5. Nutzer fragen (Runde 6): Fühlt sich das Formation-Ziehen richtig an (Breite, Blickrichtung)? Ist die
   Bevölkerungsanzeige verständlich? Fehlt beim Straßen-Werkzeug „Punkte verschieben“?
6. Nutzer fragen: Wirken die Wege jetzt wie Trampelpfade? Sitzen Kirche und Burg richtig? Mauerbau mit Rasterpunkten
   bequem? (Runde 5 im Browser nur über simulierte Eingaben geprüft, nicht live mit der Maus gespielt.)

## Verlauf der Runden
### Runde 8 — Tore quer, Mauertürme, Schnee, Kampf auf Mauern, Häuserzeilen
Nutzerwunsch (4 Punkte mit Bildern, Freiburg-Altstadt als Vorbild):
- **Tore:** `torAusrichten()` (strassen.js) stellt das Torhaus rechtwinklig zur Straße auf den Schnittpunkt Mauer × Straße;
  die alte Mauerlinie bleibt in `g.ende` und wird in abgeleitet.js zusätzlich gerastert (keine Lücke). Test: 0° Abweichung.
- **Mauertürme (`eckturm`, mauer:true, Material wie die Mauer):** `endTuermeSetzen()` (befehle.js) — offenes Ende eines
  neuen Mauerzugs ≤ 4,5 Kacheln vor Wasser/Kartenrand (auch über Böschung) oder ≤ 2,5 vor Fels/sehr steilem Hang
  (steil > 110) → verlängern + Turm, dessen Kante das Hindernis berührt. Kostenlos. Stein rund, Holz eckig mit Dach.
  Wird wie ein Turm behandelt (Rasterpunkte, Stellung beziehen). Auch beidseits eines Flusses, den die Mauer quert.
- **Schnee** auf Mauerknoten (Pfeilern) im Winter.
- **Kampf auf Mauern/Türmen:** Nahkämpfer unten machen 0 Schaden an der Besatzung, Fernkampf halb; Räuber visieren
  Besatzung nicht mehr an (`naechster(..., amBoden)`). Speerträger oben werfen Steine: `KAMPF.steinwurf`
  (2,5 Kacheln, 6–10, Takt 14), Ereignis 'stein' (graue Kugel). `mauerReichweiteSpeer` entfernt.
- **Häuser:** Grundstück = Haus + Garten (`grundstueck`, `gartenTiefe` in baumeister.js), keine Überlappung mehr
  (Test). Im Kern Wand an Wand, Zeilen setzen sich an der Straße fort (`zeilenPlaetze`); Keile zwischen verdrehten
  Nachbarn füllt `zwischenstuecke` (szene.js) mit einem Zwischenbau. Details: LERNBUCH Runde 8.

### Runde 7 — Straßenbild, weniger Straßen, Flickenteppich-Felder, Heilung
Nutzerwunsch (4 Punkte, mit Bildern): Belag-Mix und Marktübergänge unschön; Felder/Weiden sollen den Platz voll
nutzen (wie Google-Maps-Flur); weniger Straßen, klare Linien; Soldaten in Kaserne/Burg heilen. Details und Messung:
`.claude/skills/stadtplaner/LERNBUCH.md` (Runde 7).
- **Straßenbild:** `zeichneStrassen` zeichnet in Lagen über alle Straßen (Randzone → Erde → Kies → Pflaster); der
  Marktplatzboden kommt aus derselben Pflaster-Lage (`platzUmriss`), das Markt-Sprite hat kein eigenes Pflaster mehr.
- **Weniger Straßen:** Gassen nur noch für Häuser (die Fischerhütte baute Gassen); je Zone höchstens ein neuer Weg pro
  Tag (`WEGE` in data/werte.js); Acker/Weide: eine gerade `feldwegAchse()` durch die Mitte des Landes, Notlösung mit
  höchstens einem Knick; Sperre, wenn ein neuer Weg nichts brachte. Forst/Bergbau wie bisher (Hang).
  Jede Straße trägt `herkunft` (handel, burgweg, gasse, anschluss, erschliessung, anbindung, herr) zum Messen.
  Seed 42 Tag 20: 40 → 18 Straßen, 443 → 283 Kacheln.
- **Felder:** `felderWachsen()` (baumeister.js): kleine Startfelder, wachsen reihum bis Straße/Nachbar/Zonenrand/Hang,
  Grenzen `FELD.maxFeld`/`maxHof`, `WEIDE.maxFeld`; Hufen-Streifen ±4,6 Kacheln. Ertrag/Arbeit/Pflege nach Fläche
  (`feldProzent`), Viehhof nach Weidefläche (`viehTakt`). Start baut Höfe ein zweites Mal nach dem Holzfäller.
- **Heilung:** In/an Burg und Kaserne 1 Leben je 3 Ticks (`KAMPF.heilTakt`, `heilRadius`); Soldaten auf eigene Faust
  unter 70 % gehen zum Heilen dorthin (auch bei Sammelpunkt) und bleiben bis voll (`u.heilen`, Zustand 'heilen').
  Burg/Kaserne-Fenster zeigt „Verwundete in Pflege“. Neue Tests: Heilung (Weg zur Burg, schnell gesund).
- Im Browser angesehen (Seed 42 und 7 nach 20 Bot-Tagen): Markt und Straßen gleiches Pflaster, Felder als Blöcke mit
  schmalen Hecken, Achsen gerade. Konsole ohne Fehler.

### Runde 6 — Straßen-Werkzeug, Cheat, Bevölkerung, Formation, Feldpflege
Nutzerwunsch (7 Punkte): Handoff lesen, Server starten, Straßen setzen/bearbeiten, Cheat-Knopf, genaue
Bevölkerungsanzeige, Formation wie in Total War per Rechtsklick ziehen, Bauern zwischen Saat und Ernte beschäftigen.
- **Straßen** (links, Abschnitt „Straßen“): Feldweg/Gasse/Hauptstraße — Punkte klicken, Rechtsklick/Doppelklick/Enter
  legt an, Esc verwirft; Fang an Straßenenden und -segmenten; Vorschau grün/rot mit Grund. „Umwidmen“ (Klick:
  Weg → Gasse → Haupt → Weg), „Entfernen“. Befehle `strasse`/`strasseArt`/`strasseWeg`, Prüfung `strassePruefen()`
  (sim/befehle.js, auch von der Vorschau benutzt). Kostenlos. Entfernt = `weg:true` + `punkte:[]`.
- **Cheat:** Knopf „🎁 +200“ oben rechts → Befehl `cheat` (+200 jeder Ware in die Burg).
- **Bevölkerung** (rechts, Stadt-Seite oben): arbeiten gesamt + je Bereich (Nahrung, Feldpflege, Holz, Baustellen,
  Stein/Erz/Schmiede), ohne Arbeit, für Rekruten verfügbar (Bewohner − 12; davon ohne Arbeitsausfall), jetzt
  rekrutierbar (min. aus Leuten, Waffen, Gold, Plätzen, mit Grenze), in Ausbildung/Auftrag. Oben in der Leiste:
  `👥 46 (⚒15 · 31 frei · 🛡0)`.
- **Formation:** Soldaten gewählt + rechte Taste gedrückt ziehen (> 10 px) = Front ziehen; Länge/0,7 + 1 = Mann je
  Reihe (mind. 3), Blick 90° links der Zugrichtung (links→rechts = Norden, wie Total War). Vorschau mit Punkten
  (braun Speer vorn, grün Bogen hinten), Pfeil, „x breit × y tief“. Befehl `einheiten/gehe` mit `w`, `reihe`;
  `formationsPlaetze()` in sim/befehle.js; Soldaten schauen beim Halten in `w`. Ohne Soldaten-Auswahl bleibt
  Rechts-Ziehen = Karte schieben; mittlere Taste/WASD schieben immer.
- **Feldpflege:** Wenn nichts zu säen/ernten ist, hackt/jätet 1 Bauer je Hof das wachsende Acker-Feld mit der
  geringsten Pflege (`f.pflege` 0..100, `FELD.pflegeTicks` 25 Arbeiter-Ticks je Punkt); Ernte × (1 + Pflege×25 %).
  Der zweite Bauer ist frei. Im Hof-Fenster „gepflegt x %“ und was die Bauern tun; im Bild läuft ein Bauer die Furchen
  ab und hackt. Winter/brach: Bauern helfen anderswo (zählen als „ohne Arbeit“).
- Neue Tests: Cheat, Straße anlegen/abgelehnt/umwidmen/entfernen, Formation (Blick, Breite), Feldpflege.
- Im Browser geprüft: Straßen-Werkzeug mit echten Klicks, Formation mit simulierten Rechts-Zieh-Ereignissen.

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
  Runde 8 (Tore, Mauertürme, Schnee, Zwischenstücke in Kurven) nur per Test und Fehlerfreiheit, Bild nur teils gesehen.
- Seed 7: 0,44 scharfe Knicke je 10 Kacheln (Ziel ≤ 0,5 erreicht) — Rest sind gewundene Forst-/Bergbauwege am Burgberg.
- Handelsstraße: Übergang Pflaster → Kies ist eine harte Kante.
- Acker-Achsen: etwa eine je Hof, weil der Test-Bot viele kleine Ackerflecken ausschreibt (ein Mensch malt größer).
- Dreiecksplätze an Gabelungen, Eckhäuser an Kreuzungen, Häuser in zweiter Reihe am Markt.
- Uferböschung recht breit; Burghof wirkt leer. Torhaus über Feldwegen wirkt evtl. übertrieben (gleiches Torhaus).
- Räuber laufen um kurze Mauern herum (gewollt); kein „Tor schließen“. Mauerbesatzung bekommt keine eigene Anzeige.
- „Nichtstun“ verliert seit Runde 7 nicht mehr (Startfelder wachsen) — gewinnt aber nicht; ggf. Startfelder kleiner.
- Straßen-Werkzeug: Punkte verschieben fehlt (bisher entfernen + neu ziehen); Spieler-Straßen tragen `vomHerrn`, ungenutzt.
- Speichern im Browser fehlt; Mühle/Bäcker, Kirche als 5. Bedürfnis, Markttage, Belagerung.
- Multiplayer: zweiter Herr mit eigener Burg, dann WebSocket-Lockstep (`netz/PROTOKOLL.md`).

## Debug
Browser-Konsole: `spiel.z` (Zustand), `spiel.v.senden({...})`, `spiel.vorspulen(n)`, `spiel.szene.stat` (Zeichenzeit),
`spiel.z.herren[0].planLog` (Baumeister). Überfall sofort: `spiel.z.naechsterUeberfall = spiel.z.tick + 1`.
Ausgeblendetes Vorschaufenster: `canvas.width/height` und `spiel.kamera.b/h` von Hand setzen, dann `spiel.vorspulen(0)`.
