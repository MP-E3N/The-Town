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
