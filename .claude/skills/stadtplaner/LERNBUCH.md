# Lernbuch des Stadtplaners

Jede Runde einen Eintrag anhängen (neueste unten). Form: **Beobachtung → Ursache → Änderung → Messung → Lehre**.

---

## 2026-11-12 — Runde 1: „Straßen sehen wie Würmer aus und enden an komischen Punkten“

**Beobachtung (Nutzer):** Straßen schlängeln sich, Gassen hören mitten im Feld/Wohnland auf.

**Ursachen:**
1. Wege kamen direkt aus der A*-Kachelsuche (8 Richtungen), nur jede 2. Kachel + einmal Chaikin → Zickzack.
2. Neue Gassen: A*-Stichweg zu „irgendeiner“ unerschlossenen Kachel, dann ein paar Schritte weiter — ohne Ziel,
   ohne Anschluss. Bei jedem fehlgeschlagenen Hausplatz kam eine neue Gasse dazu → Wohnland zerstückelt.
3. Erste Fassung von `planeWohngasse`: Die Mutterstraße selbst lag innerhalb des Blockabstands → jede Gasse
   wurde nach 2 Schritten abgebrochen (Seed 99: 0 von 58 Versuchen gelangen).
4. Danach: Eine Gasse, die nur auf vorhandener Straße lief, galt als „verbunden“ → 40× dieselbe Gasse.

**Änderungen:**
- `begradigen()`: weitester gerade erreichbarer Punkt (Wasser nur, wo der Originalweg schon Brücke war; Hang ≤ 30
  je 0,4 Kacheln), Ecken als Bögen (`ecktenRunden`). Gilt für Burgweg, Handelsstraße, Zufahrten, Anbindungen.
- `planeWohngasse()`: T-Abzweig im rechten Winkel, läuft gerade, dreht nur am Hang (±12°/±24°), hält Blocktiefe
  (Straßenabstand > 2 erst ab Schritt 4), verbindet sich mit Nachbarstraßen; Bewertung = bebaubare Front,
  Anschluss (+30), Marktnähe, wenig Knicke. Mindestens 3 neue (nicht schon Straße) Kacheln.
- Wohnland bekommt keine A*-Stichwege mehr als Notlösung.
- Dichte: Häuserabstand 90 statt 380 Milli entlang der Straße, Rand 60; im Kern (≤ 11 Kacheln vom Markt)
  Bürgerhäuser mit 8 Plätzen; Plätze rund um den Marktplatz mit Front zum Platz werden bevorzugt.
- Markt als länglicher Straßenmarkt entlang der Handelsstraße, Rathaus auf der burgabgewandten Längsseite, Kirche geostet.

**Messung (Seed 42, Tag 20, kluger Bot):** scharfe Knicke 0,34 je 10 Kacheln (vorher nicht gemessen, sichtbar viele).
Sackgassen-Zähler 30 — zählt aber auch Feldwege zu Höfen mit; nächste Runde den Zähler auf Wohnland beschränken.

**Lehren:**
- Immer prüfen, ob die *eigene* Ausgangsstraße eine Abstandsregel verletzt.
- „Verbunden“ heißt: neue Kacheln + Treffpunkt mit einer *anderen* Straße.
- Fehlschläge nie mit Ersatzstraßen beantworten — lieber melden „mehr Land ausschreiben“.

**Offen für Runde 2:** Sackgassen nur im Wohnland zählen; Gassenenden ohne Anschluss nachträglich an die nächste
Straße anbinden, sobald dort gebaut ist; Häuser auch in zweiter Reihe am Platz; Stadtmauer-Ring als Planungsgrenze.

---

## 2026-11-12 — Runde 2: „Straßenführung immer noch nicht immersiv, Aussehen überarbeiten“

**Beobachtung (Nutzer):** Straßen wirken noch künstlich; Optik zu einheitlich (heller Strich mit Rand).

**Ursachen:**
1. Optik: ein einziger Farbton mit runder Kappe und dunkler Kontur — sieht aus wie ein gemalter Schlauch.
2. Lineal-gerade Strecken mit Bogen-Ecken wirken geplant, nicht gefahren.
3. Feldwege im Ackerland liefen als „gasse“ und wurden wie Stadtgassen gezählt und gezeichnet.
4. Gassenenden blieben offen, auch wenn später daneben eine Straße entstand.

**Änderungen:**
- Darstellung (`render/szene.js` → `strassenCache`, `zeichneStrassen`): alle 0,5 Kacheln abgetastet, ganz leichte
  Querschwingung (≤ 14 % der Breite, an Enden/Brücken null) und Catmull-Rom-Kurven; ausgetretener, unregelmäßiger
  Wegrand; Beläge als Muster (`sprites.strassenBelag`): **Pflaster** im Stadtkern (≤ 10 Kacheln vom Markt),
  **Kies** auf der Handelsstraße außerhalb, **Erde** in Gassen; **Feldwege** mit zwei Fahrspuren und Grasnarbe;
  blasse, unterbrochene Radspuren (durchgezogene sahen aus wie Schienen); Brücken mit Geländer und Pfosten;
  Hausgärten hinter Wohnhäusern.
- Simulation: Zufahrten außerhalb des Wohnlands sind immer `weg` (Feldweg); `gassenEndeAnschliessen()` schließt
  offene Gassenenden (±30°, ≤ 7 Kacheln, Hang ≤ 45) an Nachbarstraßen an, sobald sich neue Straßen ergeben.
- Messwerkzeug: Sackgassen nur für Gassen, getrennt „im Wohnland“; eigene Straße zählt nicht als Anschluss.

**Messung (Tag 20, kluger Bot):**
| Seed | Knicke/10 Kacheln | Gassen-Sackgassen (im Wohnland) |
|---|---|---|
| 42 | 0,37 | 3 (3) |
| 7 | 0,51 | 2 (2) |
| 99 | 0,44 | 1 (1) |
Vorher (gleicher Zähler, Feldwege noch als Gasse): 13 / 9 / 13 Sackgassen.

**Lehren:**
- Immersion entsteht zu großen Teilen in der Darstellung (Belag, Rand, Spuren) — die Geometrie darf gerade sein,
  das Bild nicht lineal-glatt.
- Kennzahlen zuerst ehrlich machen (falscher Sackgassen-Zähler hat jede Straße mitgezählt).
- Radspuren nur angedeutet; zu deutlich = Schienen/Würmer.

**Offen für Runde 3:** Seed 7 hat 0,51 Knicke — Ursache suchen (vermutlich Hangstraßen am Burgberg);
Platz- und Kreuzungsaufweitungen (Dreiecksplätze an Gabelungen); Häuser an Kreuzungen über Eck stellen.

---

## 2026-11-13 — Runde 5: „Markt zu groß, Burg zu nah, Straßen wie Würmer, Kirche falsch platziert“

**Beobachtung (Nutzer, mit Bild):** Kirche steht neben der Burg am Ufer, quer im Feld, ein Weg läuft unter ihr durch;
Burg klebt am Markt; Wege sehen weiter wie Würmer aus statt wie Trampelpfade; Straßenführung teils unglücklich.

**Ursachen:**
1. Burg war nur ~8 Kacheln vom Markt (Gelände-Erzeugung), Kirche suchte den ersten freien Ring-Platz mit festem
   Winkel 270° — ohne Blick auf Portal, Straße, Wasser. Ihr Anbindungsweg wand sich dann ums Gebäude.
2. Handelsstraße nach dem Burgweg gebaut: A* nutzte den Burgweg (billig), `begradigen()` machte daraus eine zweite,
   parallele Straße daneben (Textkarte: drei `=`-Reihen übereinander).
3. Optik: dicker Strich + dunkle Kontur + Sinusschwingung = Schlauch. Pflaster je Punkt im Kernradius →
   graue Flecken, wo eine Gasse den Radius nur streift.

**Änderungen:**
- Burg 17–23 Kacheln vom Markt; erst Handelsstraße, dann Burgweg; `nurNeuerTeil()` schneidet Anfang/Ende ab,
  die schon auf Straße liegen → T-Kreuzung statt Parallelstraße.
- Kirche: Kandidaten 3,5–10,5 Kacheln um den Markt × Winkel 240–300°; Pflicht: Portal ≤ 3 Kacheln von Straße,
  nicht im Wasser; Wert = Abstand + Portalabstand×1500 + Winkelabweichung×60 + Wasser×900.
- Wege als Flächen: Ränder je Seite eigenes Rauschen (Erde 30 %, Kies 22 %, Pflaster 6 %), weiche Randzone (130 %
  Breite, 22 % Deckkraft), keine Kontur, Mittellinie nur 5 % Schwingung. Gassen ganz oder gar nicht gepflastert.

**Messung (Tag 20, kluger Bot):**
| Seed | Knicke/10 Kacheln | Gassen-Sackgassen |
|---|---|---|
| 42 | 0,37 → 0,32 | 3 → 5 |
| 7 | 0,51 → 0,51 | 2 → 2 |
| 99 | 0,44 → 0,40 | 1 → 4 |
Start Seed 42: Straßen 6 → 8, Sackgassen 1 → 0. Mehr Sackgassen an Tag 20, weil die Stadt jetzt ohne Burg-Nachbarschaft
in andere Richtungen wächst — nächste Runde ansehen.

**Lehren:**
- Reihenfolge des Straßenbaus zählt: erst die Achse (Handelsstraße), dann Anschlüsse; jeder neue Weg nur ab der
  Stelle, wo er das Netz verlässt.
- Bedeutende Gebäude brauchen eine **Beziehung** (Portal zur Straße, Front zum Platz), nicht nur einen freien Fleck.
- „Wurm“ ist vor allem eine Frage der Kanten: parallele, glatte Ränder + Kontur. Unregelmäßige, weiche Ränder
  machen auch gerade Wege natürlich.

**Offen für Runde 6:** Sackgassen an Tag 20 (42: 5, 99: 4) senken; Seed 7 Knicke; Pflaster-Gassen an der Grenze
(Mitte knapp innerhalb 7 Kacheln) prüfen.

## Runde 6 (2026-11-13) — Der Herr darf selbst Straßen ziehen

**Nutzerwunsch:** „Ich habe kein Tool, um Straßen zu setzen bzw. sie zu editieren.“ (Der Spieler will also doch
eingreifen können, wo der Baumeister daneben liegt — der Baumeister plant aber weiter selbst.)

**Änderung:**
- Befehle `strasse` (Linienzug, Art Feldweg/Gasse/Hauptstraße), `strasseArt` (umwidmen), `strasseWeg` (entfernen).
- `strassePruefen()` (sim/befehle.js): Mittellinie alle 0,25 Kacheln gegen Gebäude/Felder (Rechteck um 0,1 geschrumpft),
  Land-Radius, Wasser höchstens 6 Kacheln am Stück (Brücke). Mauern erlaubt → `toreSetzen()` macht ein Torhaus.
- Entfernte Straße: `weg:true` + `punkte:[]` — alle Raster und Planer lesen nur die Punkte, damit ist sie überall weg
  (szene.js `strassenCache` überspringt sie ausdrücklich, weil dort sonst `p[-2]` gelesen würde).
- Spieler-Straßen tragen `vomHerrn: true` (noch ungenutzt; gedacht für „Baumeister fasst sie nicht an“).
- Fangen in der Vorschau: zuerst Straßen-Enden, dann der nächste Punkt auf einem Segment → T-Anschluss ohne Lücke.

**Lehre:** Ein Werkzeug für den Spieler braucht dieselbe Prüfung in Vorschau und Befehl (eine Funktion, beide rufen sie)
— sonst zeigt die Vorschau grün und der Befehl lehnt ab.

**Offen:** Ob der Baumeister an Spieler-Straßen gut anbaut (Gassen ins Wohnland), wurde nur im Test, nicht im Spiel gesehen.
Straßenpunkte verschieben (echtes „Bearbeiten“) fehlt noch — bisher entfernen + neu ziehen.

## 2026-11-13 — Runde 7: „Wilder Belag-Mix, zu viele Straßen, Felder nutzen den Platz nicht“

**Beobachtung (Nutzer, mit drei Bildern):** Pflaster, Kies, Erde und Feldwege stoßen kreuz und quer aneinander,
auch der Markt passt nicht zu den Straßen. Viele Feldwege winden sich um die Felder. Felder sind feste Kästchen
mit Grasstreifen dazwischen — „bei Google Maps wird der Platz voll genutzt“ (Flickenteppich mit Hecken).

**Ursachen (gemessen mit Herkunft je Straße, neues Feld `s.herkunft`):**
1. Seed 42, Tag 20: 40 Straßen. Davon 25 „Erschließung“ (A*-Suchweg zu jeder Zone, bei JEDEM Fehlschlag eines
   Hofs/Bruchs neu), 7 Wohngassen für nur 5 Häuser — ausgelöst von der **Fischerhütte** (Zone Wohnland), der eine
   Gasse gar nichts nützt.
2. Darstellung: Straße für Straße gezeichnet → wer später kam, lag oben (Erd-Ende über Pflaster, Kies über Pflaster).
   Der Markt hatte im Sprite ein eigenes, helleres Pflaster.
3. Felder: feste 2,7 × 3,9 Kacheln in festen Plätzen hinter dem Hof.

**Änderungen:**
- `versuche()`: Gasse nur für Häuser; je Zone höchstens ein neuer Weg pro Tag (`WEGE.abstandTicks`); bringt ein neuer
  Weg (Acker/Weide) keinen Bauplatz, Sperre für diese Art bis neues Land ausgeschrieben ist, mind. 3 Tage.
- `feldwegAchse()`: Acker/Weide bekommen EINE gerade Achse von der nächsten Straße durch den **Schwerpunkt** des freien
  Landes (Umkreis 9) bis zum Zonenrand; ≥ 6 Kacheln im Land, Zufahrt ≤ 20 Kacheln, ±10°/±20° probiert, nie parallel
  neben einer Straße. Notlösung Suchweg nur mit höchstens EINEM Knick. Forst/Bergbau unverändert (Hang!).
- `felderWachsen()`: kleine Startfelder mit Lücken, dann wachsen alle Seiten reihum (0,4, zuletzt 0,1 Kacheln) bis
  Straße / Nachbar (Hecke 0,12) / Zonenrand (85 % in der Zone) / Wasser, Fels, Steilhang / Grenze (36 Kacheln² je
  Feld, 100 je Hof, Weide 50). Im Raster des Hofs, nie vor die Hof-Front, seitlich höchstens ±4,6 Kacheln (Hufe),
  damit Nachbarhöfe an derselben Achse Platz finden. Ertrag, Säen/Ernten und Pflege skalieren mit der Fläche
  (`feldProzent`), der Viehhof mit der Weidefläche (`viehTakt`, 0,5…2×).
- Darstellung: Lagen über alle Straßen (Randzone → Erde → Kies → Pflaster + Marktplatz); Grasnarbe/Spuren in ihrer
  Lage; Platzboden mit demselben Pflaster-Muster wie die Straßen (`platzUmriss`); Feldwege im Kern auch gepflastert.

**Messung (Tag 20, kluger Bot):**
| Seed | Straßen (Kacheln) | Knicke/10 Kacheln | Gassen-Sackgassen |
|---|---|---|---|
| 42 | 40 (443) → 18 (283) | 0,32 → 0,21 | 5 → 0 |
| 7 | — → 25 (320) | 0,51 → 0,44 | 2 → 0 |
| 99 | — → 15 (302) | 0,40 → 0,30 | 4 → 0 |
Bot gewinnt 5/5 an Tag 20–28 (vorher 22–39). Achtung: „Nichtstun“ verliert nicht mehr (größere Startfelder), gewinnt aber nicht.

**Lehren:**
- Erst messen, WOHER die Straßen kommen (Herkunft je Straße) — die Ursache war ein fremder Auslöser (Fischerhütte).
- Ein Fehlschlag darf keinen Weg erzeugen, der wieder nichts bringt: sperren, bis sich die Lage ändert.
- Wachsende Flächen brauchen eine Grenze, die dem Nachbarn Platz lässt (Hufe) — sonst frisst der erste Hof die Front.
- Startfelder dicht an dicht blockieren sich gegenseitig beim Wachsen: mit Lücken säen, reihum wachsen lassen.
- Überdeckung beim Zeichnen nach Rang ordnen, nicht nach Entstehung.

**Offen:** Seed 7 baut am Burgberg noch viele gewundene Forst-/Bergbauwege (17/14 Punkte); Übergang Pflaster→Kies auf
der Handelsstraße ist eine harte Kante; Acker-Achsen je Hof noch ~1:1, weil der Bot viele kleine Flecken ausschreibt.

## 2026-11-13 — Runde 8: „Kollisionen unter Gebäuden — Häuser dürfen Wand an Wand stehen (Freiburg)“

**Beobachtung (Nutzer, Bild + Freiburger Salzstraße):** Gärten (gestrichelte Rechtecke) liegen unter Nachbarhäusern;
in der Altstadt stehen Häuser Wand an Wand und folgen der Straße wie eine Ziehharmonika.

**Ursache:** Der Garten hinter dem Haus war reine Optik (zeichneGaerten prüfte nur die Mittelkachel) — die Simulation
kannte ihn nicht und setzte Nachbarhäuser darauf. Häuser hielten 0,06 Kacheln Abstand, Zeilen entstanden nur zufällig.

**Änderung:**
- `grundstueck(o, wohn)` = Haus + Garten dahinter (`gartenTiefe`: Bürgerhaus 0,7, Wohnhaus 1,0). `pruefePlatz` prüft
  bestehende Häuser immer als Grundstück; neue Häuser werden als Grundstück geprüft.
- Stadtkern: rand −10 (Berühren erlaubt). `zeilenPlaetze(H, seite)`: neues Haus mit gemeinsamer vorderer Ecke neben H,
  ausgerichtet an der Straßenrichtung an dieser Ecke (≤ 35° Knick), notfalls 0,1–0,45 weiter außen; Bonus −7000.
- Darstellung `zwischenstuecke`: Keil zwischen zwei Nachbarn (eine Ecke ≤ 0,35, andere ≤ 1,6 Kacheln, ≤ 40° verdreht)
  bekommt ein Zwischenstück mit Dach und First.

**Messung (Tag 20, kluger Bot):** Dichte im Wohnland Seed 42: 0,51 → 0,88 Plätze je bebauter Kachel; Seed 7: 0,61.
Neuer Test: kein Grundstück überlappt ein anderes Gebäude (0 Treffer).

**Lehre:** Was im Bild zum Haus gehört (Garten, Hof), muss auch in der Simulation zum Grundstück gehören — sonst
plant der Baumeister darauf.
