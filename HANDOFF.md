# HANDOFF — Lehnsherr von Eschenbrück

## Stand (2026-11-12): spielbare Demo, vom Nutzer noch nicht gespielt
Starten: Vorschau „lehnsherr" (Port 5178) oder
`powershell -ExecutionPolicy Bypass -File ..\serve.ps1 -Port 5178 -Root Lehnsherr` → http://localhost:5178
Feste Karte: `?seed=42`. Tests: `node tests/sim.test.js` (≈ 5 s, ALLES GRUEN). Kein Git-Repo.

### Enthalten
- Karte 128×96 aus stetigen Rauschfunktionen: Fluss Ilmbach mit Uferböschung, Burghügel, Erz- und Steinhügel,
  Wälder (Laub/Nadel), Fruchtbarkeit. Herrschaftsgebiet = 34 Kacheln um die Burg (gestrichelter Kreis).
- Start: Burg, Marktplatz, Handelsstraße mit Brücke, Speicher, 5–6 Häuser, 1–2 Höfe mit Feldern, Holzfäller,
  3 Burgwachen — alles vom selben Baumeister gesetzt, der später weiterbaut.
- **Ausschreiben** (Pinsel): Wohnland, Acker, Weide, Forst, Bergbau, Aufheben.
- **Baumeister** (`sim/baumeister.js`): Plätze entlang der Straßen, Front zur Straße, leicht gedreht, SAT-Kollision,
  Hang/Wasser/Fels-Prüfung; neue Gassen per Wegsuche mit Hangkosten; Höfe mit 2–4 gedrehten Feldstreifen,
  Viehhof mit Weide; zweiter Speicher bei weiten Wegen. Baut Häuser nur, wenn der Vorrat bis zur Ernte reicht.
- **Wirtschaft**: Arbeiterverteilung nach Priorität, Träger/Erntewagen laufen echte Wege, Felder säen → wachsen →
  ernten, Winter verdirbt Ungeerntetes, Holzfäller fällen Kartenbäume und forsten auf, Schmiede (Holz+Eisen→Waffen).
- **4 Bedürfnisse** Nahrung/Unterkunft/Wärme/Sicherheit → Zufriedenheit → Zuzug/Wegzug, Steuer 3 Stufen, Sold.
- **Militär**: Kaserne (wirbt an), Wachturm (Pfeile), Waffenschmiede, Speicher, Palisade/Steinmauer (Linie,
  über Straßen automatisch Tor), Sammelpunkt, Abreißen. Räuberbanden ab Tag 9, wachsend; plündern, brennen,
  reißen Mauern ein, fliehen; Soldaten rücken aus, Beute wird zurückgeholt.
- **Darstellung**: Gelände-Chunks (8×8 Kacheln, 24/64 px pro Kachel, LRU), Zoom 6–128 px/Kachel,
  prozedurale Sprites (Dächer Stroh/Ziegel/Schindel/Schiefer, Burg, Kaserne, Turm, Mauern, Bäume je Jahreszeit,
  Figuren mit 4 Laufbildern + Schlagbild, Schafe/Kühe), Rauch, Funken, Feuer, Staub, Späne, fallende Bäume,
  Pfeile, Schnee auf Dächern + Schneefall, wogendes Korn, Gras/Blumen beim Nahzoom, Passanten, Zuzügler.
- Multiplayer-Vorbereitung: Befehle mit `spieler`, `z.herren[]`, `besitzer`, deterministisch, `abspielen()`.

### Balance (tests/bots.js, kluger Bot)
- Kluger Bot (schreibt Acker/Weide/Forst/Bergbau/Wohnland aus, Schmiede, 2 Kasernen, 1 Turm): Sieg auf 5/5 Karten
  an Tag 33–39 (= ca. 33–39 Minuten bei Tempo 1, 8–10 Minuten bei Tempo 4).
- Nichtstun: Stadt verlassen an Tag ~22 (Hunger vor der zweiten Ernte).
- „5 satte Tage" ist am Anfang leicht; die eigentliche Hürde ist die Garnison (Waffen ← Erz, Gold, freie Leute,
  Vorrat bis zur Ernte).

### Selbst getestet (Browser-Fenster, teils per Vorspulen)
Start/Intro, Übersicht/Mittel/Nah-Zoom, Burg, Markt, Felder (reif/wachsend), Fischer, Winter mit Schnee,
Zonen malen per Maus-Ziehen, Kaserne-Vorschau (rot „zu steil"/„Straße", grün = ok, Front zur Straße) und Bau,
Palisade per Klicks inkl. Tor über der Straße, Überfall mit Kampf und Feuer, Gebäude anklicken (Info).
Zeichenzeit: ~11 ms Übersicht (2000 Bäume), ~2–5 ms nah. Keine Konsolenfehler mehr.
**Nicht** lange in Echtzeit mit der Maus gespielt (Fenster war teils ausgeblendet); Steinmauer, Sammelpunkt,
Abreißen-Werkzeug, Steuer-Knöpfe nur kurz bzw. nur in der Simulation geprüft.

### Debug
Browser-Konsole: `spiel.z` (Zustand), `spiel.v.senden({...})`, `spiel.vorspulen(n)`, `spiel.szene.stat`,
`spiel.z.herren[0].planLog` (Entscheidungen des Baumeisters). Überfall sofort: `spiel.z.naechsterUeberfall = spiel.z.tick + 1`.

## Ideen / offen
- Nutzer-Rückmeldung zum Spielspaß abwarten, dann gezielt nachschärfen.
- Uferböschung ist recht breit (viele Hang-Kacheln am Fluss) → evtl. flacher.
- Burg-Sprite: Hof wirkt leer; Bergfried größer/mittiger.
- Speichern im Browser, Mühle/Bäcker, Kirche (5. Bedürfnis), Markttage/Händler, Belagerung.
- Multiplayer: zweiter Herr mit eigener Burg (siehe `netz/PROTOKOLL.md`), dann Node-WebSocket-Lockstep.
