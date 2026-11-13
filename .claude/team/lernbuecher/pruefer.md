# Lernbuch des Prüfers

## Regeln (verdichtet, Stand Runde 9)
1. Neue Werkzeuge an echten (generierten) Spielinhalten prüfen, nicht nur an selbst gebauten Testobjekten.
2. Grafik im Winter UND Sommer ansehen (weiße Eckkappen fielen nur im Winter auf).
3. Bei ausgeblendetem Vorschaufenster: `canvas.width = innerWidth`, `spiel.kamera.b = innerWidth`, `spiel.vorspulen(0)`;
   Screenshot kann eine Runde hinterherhinken → zweimal aufnehmen.
4. Bot-Siegtage je Seed vorher → nachher in jeden Testbericht.

## Einträge
### 2026-11-13 — Runde 9
**Beobachtung:** Alles grün, Nutzer fand trotzdem: zu viele Straßenpunkte, runde Feldecken, dicke Zinnen, Restknoten.
**Ursache:** Testrunde prüfte Funktion, aber nicht „sieht es so aus, wie der Nutzer es beschrieben hat?“.
**Lehre:** Im Testbericht je Nutzerpunkt eine Zeile „entspricht dem Wunsch? (Bild)“.

### 2026-11-13 — Runde 10
**Beobachtung:** Alle Tests grün, aber Laufzeit 5 s → 68 s; ein Seed war 100× langsamer.
**Lehre:** Laufzeit JE SEED in jeden Testbericht (Skript: Bot-Lauf je Seed mit Zeitmessung). Ausreißer = Fehler, auch wenn grün.

### 2026-11-13 — Runde 11
**Beobachtung:** `fehler.log` leer — heißt das „keine Fehler“ oder „Leitung kaputt“?
**Änderung:** Testzeile per POST an /fehlerlog geschickt, kam an, wieder gelöscht.
**Lehre:** Ein leeres Log nur dann als „fehlerfrei“ melden, wenn die Leitung geprüft ist.
