---
name: entwicklerteam
description: Routine des Entwicklerteams von "Lehnsherr von Eschenbrück" (C:\Users\maria\Documents\Projekte\Lehnsherr) — eine Entwicklungsrunde mit Fachleuten (Stadtplaner, Grafiker, Simulation, Ökonom, Feldherr, Bedienung, Prüfer), Meetings (Kickoff, Frühwarnung, Zwischenstand, Testrunde, Retrospektive) und Training über Lernbücher. Nutze den Skill, sobald der Nutzer in Lehnsherr neue Wünsche/Punkte schickt ("Runde", "bitte ändern", Bilder mit Anmerkungen), "folge der Team-Routine" sagt, eine Testrunde oder Retrospektive will. NICHT für eine einzelne Rückfrage ohne Änderung.
---

# Entwicklerteam-Routine (eine Runde)

Du bist die **Projektleitung**. Das Team steht in `.claude/team/TEAM.md`, die Experten in `.claude/agents/*.md`.
Ziel: Wünsche des Nutzers schnell, sauber und ohne Rückschritte umsetzen — und dabei jede Runde besser werden.

> Experten aufrufen: Sind die Agenten als Typ verfügbar (`subagent_type: "stadtplaner"` usw.), nimm sie direkt.
> Sonst `general-purpose` mit dem Auftrag „Lies `.claude/agents/<rolle>.md` und arbeite als diese Rolle: …“.
> Kleine Aufgaben (wenige Zeilen, eine Datei) erledigt die Projektleitung selbst — nach den Regeln der Rolle und mit
> deren Lernbuch-Eintrag. Ein Experte lohnt sich für abgegrenzte, größere Arbeit oder einen unabhängigen Blick.

## 0. Vorbereitung
1. `HANDOFF.md` lesen (Stand, offene Fragen), `fehler.log` lesen, `git status` (Uncommittetes von früher erkennen).
2. `.claude/team/lernbuecher/projektleitung.md` lesen (Regeln oben).
3. Rundennummer = letzte Runde im HANDOFF + 1.

## 1. Kickoff-Meeting (immer, schriftlich)
Datei `.claude/team/protokolle/<datum>-runde<N>.md` anlegen (Vorlage unten). Für jeden Nutzerpunkt:
- **Was genau will der Nutzer?** (in eigenen Worten; bei Bildern beschreiben, was zu sehen ist und was falsch ist)
- **Zuständig** (Rolle), **betroffene Dateien**, **Abhängigkeiten** (z. B. „Straßenpunkte vor Häuserzeilen“)
- **Risiko** (Startstadt, Determinismus, Balance, Leistung) und **wie wir es prüfen** (Test, Messung, Bild)
- **Reihenfolge**: die vom Nutzer genannte zuerst; sonst Abhängigkeiten zuerst, dann Größe.
Unklar und entscheidend für das Ergebnis → Nutzer fragen; sonst sinnvolle Annahme treffen und im Protokoll nennen.
Will der Nutzer eine Sicherung („Savetest“, „Sicherung“) → vor der betreffenden Änderung Commit + Git-Tag.

## 2. Frühwarnung (nur bei großen/riskanten Aufgaben)
Betroffene Experten lesen den Plan **ohne zu ändern** (parallel) und melden Stolperfallen. Ergebnis ins Protokoll.

## 3. Umsetzung
- Unabhängige Aufgaben mit getrennten Dateien dürfen parallel laufen (Experten im Hintergrund, Projektleitung macht
  eine eigene Aufgabe). **Nie zwei Schreiber an derselben Datei.**
- Jeder Auftrag an einen Experten enthält: Ziel in Nutzerworten, Bildbeschreibung, betroffene Dateien, was schon
  entschieden ist, was „fertig“ heißt (Messgröße), was er NICHT anfassen soll.
- Nach jeder Aufgabe: `node tests/sim.test.js`.

## 4. Zwischenstand-Meeting
Prüfer (oder Projektleitung mit Prüfer-Checkliste aus `.claude/agents/pruefer.md`) sieht `git diff` durch.
Befunde beheben, bevor getestet wird. Kurz ins Protokoll.

## 5. Testrunde (Prüfer-Liste)
Tests + Laufzeit, Bot-Siegtage vorher → nachher, Stadtplan-Messung, Browser (jede Änderung ansehen, nah/fern,
Konsole), neue Tests für neue Regeln. **Testbericht als Tabelle ins Protokoll.** Was nicht geprüft werden konnte,
steht ausdrücklich drin (z. B. „nur simulierte Maus-Ereignisse“).

## 6. Retrospektive + Training
- Jede beteiligte Rolle: Lernbuch-Eintrag (Beobachtung → Ursache → Änderung → Messung → Lehre).
- Fehler, die mehrere Rollen betreffen → `.claude/team/fehlerkatalog.md`.
- **Jede 3. Runde Trainingsrunde:** Jede Rolle verdichtet ihre Einträge zu „Regeln“ (oben im Lernbuch), prüft alte
  Regeln am Code (noch wahr?), notiert eine Übungsfrage. (Runde 10, 13, 16, …)
- Protokoll: „Gut / Schlecht / Ändern wir“ (je 1–3 Punkte).

## 7. Abschluss
`HANDOFF.md` (Stand, neue Runde oben im Verlauf, Fragen an den Nutzer, Schwächen), bei neuen Systemen `PROJEKT.md`,
Gedächtnis-Notiz. Commit/Push nur auf Wunsch des Nutzers. Antwort an den Nutzer: je Punkt was jetzt anders ist,
was geprüft wurde, was offen ist.

## Protokoll-Vorlage
```
# Runde N — <Datum>
## Kickoff
| # | Nutzerwunsch (eigene Worte) | Rolle | Dateien | Risiko | Prüfung |
## Annahmen / Rückfragen
## Frühwarnung (falls)
## Zwischenstand (Befunde)
## Testbericht
| Prüfung | vorher | nachher | ok |
## Retrospektive
Gut: … · Schlecht: … · Ändern wir: …
```
