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

### 2026-11-13 — Runde 12 (Zwischenstand „Herr & Stadt“)
**Beobachtung:** Tests grün, aber zwei Lücken per Skript gefunden: `kaufen` mit `ware:'constructor'` macht Burg- und Speichergold zu NaN; Abriss von Rathaus + letztem Speicher schiebt das ganze Stadtlager in die Kammer.
**Ursache:** Prüfung `HERR.kauf[ware]` trifft auch Object.prototype; die „Fallback auf anderen Topf“-Regel in lager.js hebelt das Umlager-Verbot aus. UI versteckt Rathaus-Abriss, der Befehl erlaubt ihn.
**Lehre:** Bei jeder Trennregel (Topf, Besitzer) den Fallback-Pfad gezielt angreifen (letztes Lager weg). Befehls-Schlüssel aus Eingaben nur mit `WAREN.includes`/`Object.hasOwn` prüfen; summieren mit `|| 0` versteckt NaN in der Anzeige → im Test `g.inhalt` direkt prüfen.
