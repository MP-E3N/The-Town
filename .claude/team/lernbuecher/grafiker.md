# Lernbuch des Grafikers

## Regeln (verdichtet, Stand Runde 9)
1. Keine Kreise/Knoten auf Bauwerken, die wie Bedienpunkte aussehen (Mauerpfeiler, Eckkappen — auch im Winter weiß!).
2. Was heraussteht, braucht Schatten + helle Oberkante; sonst wirkt es flach (Zinnen Runde 10).
3. Wege sind Flächen mit ausgefransten Rändern, keine Schläuche mit Kontur (Runde 2/5).
4. Alle Wege in Lagen zeichnen (Rand → Erde → Kies → Pflaster), der bessere Belag liegt oben (Runde 7).
5. Felder eckig zeichnen, so wie die Simulation sie rechnet (Trapeze ja, runde Ecken nein).
6. Bei ausgeblendetem Vorschaufenster sind Screenshots manchmal veraltet → `spiel.vorspulen(0)`, kurz warten, erneut.

## Einträge
### 2026-11-13 — Runde 9
**Beobachtung:** Mauerpfeiler an jedem Stückende sahen aus wie Kontrollpunkte; nach dem Entfernen blieben weiße
Eckkappen im Winter („immer noch vereinzelt Knotenpunkte“).
**Ursache:** Eckkappe als Kreis in Wehrgangfarbe; im Winter fast weiß und größer wirkend als die schmale Mauer.
**Lehre:** Lücken an Ecken durch Verlängern der Mauerstücke schließen, nicht durch aufgesetzte Kreise.

### 2026-11-13 — Runde 10
**Beobachtung (Nutzer, Bild 2/3):** Äcker sollen keine runden Ecken haben; Zinnen zu dick und flach; im Winter noch
„Knotenpunkte“ (weiße Eckkappen).
**Änderung:** `feldUmriss` zeichnet das Viereck eckig. Mauer-Sprite: Brustwehr 17 % statt 36 % der Dicke, Zinnen als
kleine Klötze (24 %) mit Lichtkante und Schlagschatten nach innen; Eckkappen entfernt — `mauerEcken` liefert je Stück
die Eck-Enden, dort wird das Stück um eine halbe Dicke länger gezeichnet. Winter-Schnee auf Mauern 0,3 statt 0,55.
**Messung:** Bild Sommer (Zoom 70) und Winter (Zoom 110): Ecke geschlossen, keine Kreise, Zinnen klar erkennbar.
**Lehre:** „Heraus stehen“ = eigener Schatten + Lichtkante, nicht Größe. Winter-Überzug kann Details auslöschen —
jede Grafikänderung auch im Winter ansehen.
