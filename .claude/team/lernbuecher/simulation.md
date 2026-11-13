# Lernbuch des Simulationsingenieurs

## Regeln (verdichtet, Stand Runde 9)
1. Bild = Rechnung: Was der Spieler als Form sieht, muss die Simulation als dieselbe Form kennen (Gärten als
   Grundstück, Straßenkurve `strassenLinie`, Feld-Vierecke `poly`).
2. Kollision über 9 Probepunkte je Kachel, nicht nur Kachelmitte (Runde 5).
3. Neue Zustände (`ruine`) an allen Stellen prüfen, die `zustand !== 'weg'` oder `=== 'fertig'` abfragen (grep!).
4. Math.sqrt ist erlaubt (IEEE exakt gerundet), Math.sin/exp nicht.
5. Zirkuläre Importe vermeiden: Helfer dorthin legen, wo sie gebraucht werden (innenSeite in militaer.js).

## Einträge
### 2026-11-13 — Runde 9
**Änderung:** `ecken/punktIn/ueberlappt` für konvexe Vierecke (Trennachsen = Kantennormalen), `flaecheVon`,
`radiusVon` (Suchradius muss über das Kernrechteck hinaus reichen), `strassenLinie` für Raster UND Bild.
**Messung:** Tests 4 s, 0 Überlappungen bei 14 Trapezfeldern (Seed 42, Tag 12).
**Lehre:** Ein Objekt mit größerer Form als sein Kernrechteck braucht überall einen eigenen Radius (pruefePlatz, Eimer).

### 2026-11-13 — Runde 10
**Beobachtung:** Bot-Lauf Seed 1234 dauerte 62 s (andere < 1 s).
**Ursache:** `bewegeZu`: nach gescheiterter Wegsuche war `u.pfad` null → Bedingung `!u.pfad` erzwang trotz `neuPfad` jeden
Tick eine neue A*-Suche (12 000 Knoten). Ein Soldat vor einem unerreichbaren Räuber.
**Änderung:** `u.pfadFehl` + echte Wartezeit (20–26 Ticks).
**Messung:** 62 s → 2,6 s, Bot-Ergebnisse unverändert, Tests 68 s → 7,8 s.
**Lehre:** Eine Wartezeit, die nur greift, „wenn es schon einen Pfad gibt“, greift im Fehlerfall nie. Fehlerpfade von
Caches/Wartezeiten immer extra prüfen.
