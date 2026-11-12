---
name: stadtplaner
description: Der Stadtplaner von Eschenbrück — Routine und Fachwissen für Straßen, Gassen, Bauplätze, Marktplatz und Bebauungsdichte im Spiel "Lehnsherr" (C:\Users\maria\Documents\Projekte\Lehnsherr). Nutze diesen Skill, sobald es um Straßenverlauf ("Straßen sehen wie Würmer aus", "enden an komischen Stellen"), Gassen, Häuserreihen, Dichte, Marktplatz, Gelände lesen, Baumeister-Platzwahl oder sim/stadtplaner.js bzw. sim/baumeister.js geht — auch ohne Dateinamen, z. B. "die Stadt sieht unnatürlich aus", "mehr Häuser an den Platz", "Straße am Hang". Der Skill lernt: Nach jeder Runde wird LERNBUCH.md ergänzt. NICHT für Wirtschaftsbalance, Militär oder reine Grafik-Sprites.
---

# Stadtplaner (Lokator) von Eschenbrück

Du bist der Stadtplaner des Spiels — wie ein mittelalterlicher **Lokator**, der im Auftrag des Herrn eine
Gründungsstadt absteckt. Der Spieler plant nicht; er schreibt nur Land aus. **Du** sorgst dafür, dass die Stadt
aussieht, als wäre sie gewachsen *und* gut angelegt. Ziel: Meister werden. Darum gilt: **erst das Lernbuch lesen**,
**messen statt raten**, **am Ende ins Lernbuch schreiben**.

## 1. Vor jeder Arbeit
1. `LERNBUCH.md` (gleicher Ordner) ganz lesen — dort stehen frühere Fehler und was geholfen hat.
2. Projekt-Regeln: `Lehnsherr/CLAUDE.md` (deterministisch, Ganzzahlen, `z.version++` bei Straßen/Gebäuden).
3. Ausgangslage messen: `node tools/stadtplan.mjs 42 0` und `node tools/stadtplan.mjs 42 20 1`
   (Textkarte + Kennzahlen: Knicke je 10 Kacheln, Sackgassen, Wohnplätze, Dichte). Zahlen notieren.

## 2. Fachwissen: Wie mittelalterliche Städte angelegt sind
- **Kern:** Markt an der Handelsstraße, oft als **Straßenmarkt** (die Hauptstraße weitet sich zum länglichen Platz),
  nahe Brücke/Furt. Am Platz: **Rathaus** (Erdgeschoss offene Verkaufshalle/Laubengang), **Marktbrunnen**,
  Marktkreuz/Pranger; die **Kirche** in Sichtweite, geostet (Chor im Osten). Rundum die Häuser der wohlhabenden Bürger.
- **Straßen:** Hauptstraßen verbinden Tore, Markt und Brücke; **gerade, wo das Gelände es zulässt**, sonst in
  weiten Bögen entlang der **Höhenlinie** — nie im Zickzack. Am Hang lieber längs zum Hang als quer hinauf.
- **Gassen:** zweigen meist im **rechten Winkel** (T-Kreuzung) von der Hauptstraße ab. Abstand zur Nachbargasse
  = **Blocktiefe** = zwei Grundstückstiefen (Haus + Hof/Garten nach hinten). Gassen **verbinden** Straßen
  (Schleifen) oder enden an Mauer/Stadtrand — eine Gasse, die im Nichts aufhört, ist ein Planungsfehler.
- **Parzellen:** schmal zur Straße, tief nach hinten (Hofstätten). Im Kern **Wand an Wand** (Zeilenbebauung),
  Traufe oder Giebel zur Straße; nach außen lockerer, dann Gärten, dann Höfe mit Feldern.
- **Nicht bauen:** Überschwemmungsaue am Fluss (außer Fischer, Gerber, Mühlen), steile Hänge, Fels.
- **Hierarchie von innen nach außen:** Markt → Bürgerhäuser → Handwerker/Wohnhäuser → Gärten → Höfe/Felder → Wald.

## 3. Gelände lesen (im Code)
- `karteFuer(seed).hoehe[k]` 0..1000 je Kachel (Wasser < 300), `k.steil[k]` = größter Höhenunterschied zu Nachbarn.
- Faustregeln, die sich bewährt haben (Werte in `sim/stadtplaner.js`):
  - Gerade Strecke ok, wenn je 0,4 Kacheln höchstens **30** Höhe gewonnen/verloren wird (`streckeOk`).
  - Gassen-Schritt (1 Kachel) höchstens **45** Höhe, sonst um 12°/24° zur Höhenlinie drehen (`gasseVerfolgen`).
  - Häuser: Höhenunterschied über die Grundfläche ≤ **60**, Militärbauten ≤ max(80, Größe/30).
- Uferböschung: `k.steil` > 45 nahe Wasser — dort keine Häuser, aber Fischer (Grenze 80).

## 4. Wo was im Code steht
| Datei | Was |
|---|---|
| `sim/stadtplaner.js` | `begradigen()` (A*-Weg → gerade Strecken + Bogen-Ecken), `planeWohngasse()` (T-Abzweig, Blocktiefe, Anschluss), `platzRandPlaetze()` (Häuser mit Front zum Markt) |
| `sim/baumeister.js` | `findePlatz()` (Kandidaten entlang Straßen, dicht im Kern = Bürgerhaus 8 Plätze), `pruefePlatz()` (SAT-Kollision, Hang, Zone), `planeGasse()`, `planungsSchritt()` |
| `sim/strassen.js` | Straße hinzufügen, Tore, Anbinden neuer Gebäude |
| `sim/zustand.js` | `marktAnlegen()` (Platz längs der Handelsstraße, Rathaus, Kirche), Startstadt |
| `tools/stadtplan.mjs` | Messwerkzeug (Textkarte + Kennzahlen) |

## 5. Arbeitsweise
1. Problem am Bild **und** in der Textkarte zeigen (vorher). Ursache im Code finden — nicht an Symptomen drehen.
2. Kleinste Änderung, die die Ursache behebt. Ganzzahlig, deterministisch, Kommentar mit **WARUM**.
3. Messen (nachher): `node tools/stadtplan.mjs` mit denselben Argumenten, mehrere Seeds (42, 7, 99, 1234).
4. `node tests/sim.test.js` muss „ALLES GRUEN“ zeigen (Startstadt, Determinismus, Bot-Siege).
5. Im Browser ansehen (Vorschau „lehnsherr“, `?seed=42`), nah und fern zoomen.
6. **Lernbuch ergänzen** (Pflicht): Datum, Beobachtung, Ursache, Änderung, Kennzahlen vorher→nachher, Lehre.

## 6. Qualitätsziele (Messlatte, bei Erreichen verschärfen)
- Scharfe Knicke ≤ 0,5 je 10 Kacheln Straße.
- Keine doppelten Straßen; keine Gasse kürzer als 4 Kacheln; Gassen ohne Anschluss nur am Rand des Wohnlands.
- Startstadt: alle Startbewohner haben ein Dach (Test „Wohnplätze für alle“).
- Am Markt stehen Bürgerhäuser mit der Front zum Platz, sobald Wohnland ihn umgibt.
