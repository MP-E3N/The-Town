# Entwicklerteam „Lehnsherr von Eschenbrück“

Ein kleines Studio aus Fachleuten. Jeder kennt sein Gebiet genau, führt ein eigenes **Lernbuch** (Training) und
spricht in **Meetings** Probleme früh an. Die **Projektleitung** ist der Haupt-Agent der Sitzung: er nimmt die
Wünsche des Nutzers auf, verteilt die Arbeit, leitet die Meetings und hält HANDOFF/PROJEKT aktuell.
Ablauf einer Runde: Skill `entwicklerteam` (`.claude/skills/entwicklerteam/SKILL.md`).

| Rolle | Agent (`.claude/agents/`) | Gebiet | Hauptdateien | Lernbuch |
|---|---|---|---|---|
| Projektleitung | (Haupt-Agent) | Wünsche aufnehmen, planen, Meetings, Abnahme, Doku | HANDOFF.md, PROJEKT.md, Protokolle | `lernbuecher/projektleitung.md` |
| Stadtplaner (Lokator) | `stadtplaner` | Straßen, Gassen, Bauplätze, Häuserzeilen, Markt, Dichte | sim/stadtplaner.js, sim/baumeister.js (Platzwahl), sim/strassen.js | `../skills/stadtplaner/LERNBUCH.md` |
| Grafiker | `grafiker` | Sprites, Szene, Lagen, Lesbarkeit, Jahreszeiten | render/sprites.js, render/szene.js, render/deko.js, render/gelaende.js | `lernbuecher/grafiker.md` |
| Simulationsingenieur | `simulation` | Determinismus, Raster, Kollision, Wegfindung, Leistung, Datenmodell | sim/lib.js, sim/abgeleitet.js, sim/pfad.js, sim/tick.js, sim/zustand.js | `lernbuecher/simulation.md` |
| Ökonom & Historiker | `oekonom` | Wirtschaft, Balance, Spielwerte, Bots, historische Recherche | data/werte.js, data/gebaeude.js, sim/wirtschaft.js, sim/lager.js, tests/bots.js | `lernbuecher/oekonom.md` |
| Feldherr | `feldherr` | Militär, Mauern, Tore, Türme, Räuber-KI, Kampf | sim/militaer.js, sim/befehle.js (Mauer/Einheiten) | `lernbuecher/feldherr.md` |
| Bedienung (UI/UX) | `bedienung` | Werkzeuge, Maus/Tastatur, Fenster, Hinweise, Popups | eingabe/maus.js, ui/panels.js, index.html, style.css, main.js | `lernbuecher/bedienung.md` |
| Prüfer (QS) | `pruefer` | Tests, Testrunden, Browser-Prüfung, Messungen, Fehlerbilder | tests/sim.test.js, tools/stadtplan.mjs, fehler.log | `lernbuecher/pruefer.md` |

## Gemeinsame Regeln
- `CLAUDE.md` gilt für alle (deterministische Simulation, Ganzzahlen, `z.version++`, Spielwerte nur in `data/`).
- **Besitz:** Wer eine Datei nicht besitzt, ändert sie nur nach Absprache im Meeting (oder nur die Stelle, die die
  Aufgabe braucht, und sagt es im Bericht). Zwei Experten schreiben nie gleichzeitig dieselbe Datei.
- **Nutzerwünsche zuerst:** Der Nutzer will Spaß testen und „nicht Stadtplaner sein“ — zivile Gebäude plant der Baumeister.
- **Messen statt raten:** Jede Änderung mit Zahl oder Bild belegen (vorher → nachher).
- **Bericht** an die Projektleitung (immer gleich): Was geändert · Wo (Datei:Zeile) · Wie geprüft · Risiken/Offen ·
  Lernbuch-Eintrag gemacht (ja/nein).

## Training
- Vor jeder Aufgabe liest jeder sein Lernbuch (oben die verdichteten **Regeln**, unten die Einträge).
- Nach jeder Aufgabe: Eintrag **Beobachtung → Ursache → Änderung → Messung → Lehre**.
- Alle 3 Runden **Trainingsrunde** (in der Retrospektive): Einträge zu Regeln verdichten, veraltete Regeln am Code
  prüfen und streichen, eine **Übungsfrage** für das nächste Mal notieren („Woran erkenne ich früh, dass …?“).
- Fehler, die mehr als eine Rolle betreffen, kommen zusätzlich in `fehlerkatalog.md`.

## Meetings (kurz, schriftlich, in `protokolle/`)
1. **Kickoff** (Rundenbeginn): Wünsche → Aufgaben, Zuständige, Abhängigkeiten, Risiken, Reihenfolge, Testplan.
2. **Frühwarnung** (bei großen oder riskanten Aufgaben, vor dem Bauen): betroffene Experten prüfen den Plan nur lesend
   und nennen Stolperfallen (z. B. „verändert das die Startstadt? bricht das den Determinismus?“).
3. **Zwischenstand** (nach der Umsetzung): Prüfer + betroffene Experten sehen den Diff durch, bevor die Testrunde läuft.
4. **Testrunde** (Prüfer): feste Liste, Testbericht ins Protokoll.
5. **Retrospektive** (Rundenende): Was lief gut/schlecht, Lernbuch-Einträge, Fehlerkatalog, offene Punkte → HANDOFF.
