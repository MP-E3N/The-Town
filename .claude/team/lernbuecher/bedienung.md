# Lernbuch der Bedienung

## Regeln (verdichtet, Stand Runde 9)
1. Kamera direkt, nicht schwammig (Zoom-Rate 30, WASD schnell anfahren) — Nutzer spürt Verzögerung sofort (Runde 4).
2. Vorschau und Befehl prüfen mit derselben Funktion (`strassePruefen`, `auftragPruefen`, `mauerUmdrehen`).
3. Bedienpunkte nur im Werkzeug zeigen; im normalen Bild nichts, was wie ein Griff aussieht.
4. Zu viele Griffe sind unbedienbar: Straßen dürfen nur echte Ecken als Punkte haben (Runde 10).
5. Neue Taste/Knopf → Tooltip, Hinweistext, Intro-Hilfe.

## Einträge
### 2026-11-13 — Runde 9
**Änderung:** Werkzeug „✎ Bearbeiten“ (Klick = rund → stark → eckig, Ziehen = verschieben), Taste R beim Mauerbau,
Popup bei Hofbrand.
**Lehre:** Generierte Straßen hatten Dutzende Punkte (Chaikin-Glättung + Bögen) — das Bearbeiten-Werkzeug machte das
erst sichtbar. Ein neues Werkzeug immer an einer GENERIERTEN Straße ausprobieren, nicht nur an einer selbst gezogenen.

### 2026-11-13 — Runde 10
**Beobachtung (Nutzer, Bild 1):** Straße im Bearbeiten-Werkzeug mit über 10 Punkten, dicht gedrängt am Ende.
**Ursache:** Generierte Straßen speicherten jede geglättete Zwischenstelle als Punkt.
**Änderung:** (vom Stadtplaner) `vereinfachen()` in `strasseHinzufuegen` — nur echte Ecken. Seed 42: 111 → 43 Punkte, max 26 → 6.
**Lehre:** Regel 4 oben bestätigt; ein Griff pro Ecke, die man auch als Ecke sieht.

### 2026-11-13 — Runde 11
**Beobachtung (Nutzer):** „Ich kann nicht sagen, ob der Platz maximal genutzt wird oder später noch genutzt wird.“
**Änderung:** Stadt-Seite: „Ackerland x % genutzt · Reserve y“ mit Tooltip je Klasse + Satz „wann kommt ein neuer Hof“;
Z färbt die Klassen auf der Karte. Beide aus `flurAuswertung` — dieselben Grenzen wie der Baumeister.
**Lehre:** Wenn das Spiel selbst entscheidet (Baumeister), braucht der Spieler eine Zeile „was passiert als Nächstes und warum“.
