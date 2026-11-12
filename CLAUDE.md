# Lehnsherr von Eschenbrück — Arbeitsregeln für KI-Agenten

Konzept: `KONZEPT.md` · Stand: `HANDOFF.md` · Multiplayer-Plan: `netz/PROTOKOLL.md`.
**Zu Beginn jeder Sitzung `HANDOFF.md` lesen, am Ende aktualisieren.**
Gleicher Unterbau wie die Schwesterprojekte `..\Stadtwacht`, `..\Kronwege`, `..\Eiskoloss`.

## Technik
- JavaScript mit ES-Modulen, kein Build, kein Framework, keine Fremdbibliothek, keine Bilddateien
  (alle Sprites zeichnet `render/sprites.js` beim Start prozedural).
- Lokal über `Projekte\serve.ps1` (Vorschau „lehnsherr", Port 5178), nicht über `file://`. `?seed=42` = feste Karte.
- Tests: `node tests/sim.test.js` → „ALLES GRUEN" (Startstadt, Determinismus, Abspielen, JSON, Überfall, Balance-Bots).

## Schichten
| Ordner | darf | darf nicht |
|---|---|---|
| `sim/` | Zustand ändern (nur Befehle + Tick-Systeme) | Browser, `Math.random`, `Date`, `Math.sin/exp`, äußere Schichten |
| `netz/` | Befehle sammeln, `tick()` aufrufen, Pause/Tempo | Spielregeln |
| `render/`, `ui/`, `eingabe/` | lesen und zeichnen; Befehle nur über `verbindung.senden()` | Zustand schreiben |
| `data/` | alle Spielzahlen und Texte | Logik |

## Harte Regeln
1. Zustand ändert sich nur über `sim/befehle.js` und die Systeme in `sim/tick.js` (feste Reihenfolge).
2. Zufall in `sim/` nur über `zufall(z, n)`; Ganzzahlen; Positionen in Milli-Kacheln; Winkel in ganzen Grad
   (Sinus-Tabelle `SIN/COS` in `sim/lib.js`, Länge 1024).
3. `sim/gelaende.js` nur mit +, −, ×, ÷, floor, abs, min, max, sqrt (bitgleich in allen Browsern).
   Die Darstellung benutzt dieselben Funktionen → Ufer und Hänge passen genau zur Simulation.
4. Jede Änderung an Straßen, Gebäuden, Feldern: `z.version++` (sonst sind die Raster in `sim/abgeleitet.js` veraltet).
   Zonen: `z.zonenVersion++`.
5. Zustand = reines JSON; Listen mit Index = ID (Gebäude, Felder, Straßen); Entferntes bleibt mit `zustand:'weg'`/`weg:true`.
6. Spielwerte nur in `data/`. Nach Balance-Änderung `node tests/sim.test.js` und die Bot-Ergebnisse ansehen.
7. Gebäude-Sprites: Front (Tür, Straße) oben im Bild; Figuren schauen im Sprite nach Norden.

## Kommentare
Deutsch. Dateikopf mit ZWECK / LIEST / SCHREIBT / REGEL (/ DEBUG). Nicht Offensichtliches mit **WARUM**.

## Commits
Kein Git-Repo angelegt. Commits nur nach Freigabe des Nutzers; Deutsch, Präsens.
