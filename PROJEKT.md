# Lehnsherr von Eschenbrück („The Town“)

2D-Draufsicht-Aufbauspiel im Browser. Du bist der Herr von **Burg Eschenbrück** über der Stadt am **Ilmbach**.
Du baust die Stadt nicht selbst — du **schreibst Land aus**, und ein Baumeister legt Gassen, Höfe, Felder und
Häuser natürlich ins Gelände. Selbst gibst du nur **Militär** in Auftrag und führst deine Soldaten.

**Ziel der Demo:** 5 Tage am Stück satt und eine Garnison von 25 Mann. Unter 10 Bewohnern ist das Lehen verloren.

## Starten
```
powershell -ExecutionPolicy Bypass -File ..\serve.ps1 -Port 5178 -Root Lehnsherr
```
→ http://localhost:5178 · feste Karte mit `?seed=42` · Tests: `node tests/sim.test.js`

## Spielen in Kürze
| Was | Wie |
|---|---|
| Land ausschreiben | links Wohnland / Acker / Weide / Forst / Bergbau wählen, mit gedrückter linker Taste malen |
| Militär bauen | Kaserne, Wachturm, Waffenschmiede, Speicher; Palisade/Steinmauer Punkt für Punkt, rastet an Mauerenden ein (über Straßen → Torhaus) |
| Rekrutieren | Burg/Kaserne anklicken → +1/+5 Speerträger oder Bogenschützen; „automatisch auffüllen“ optional |
| Soldaten führen | Rahmen ziehen / anklicken / G = alle, dann Rechtsklick: Boden = marschieren+halten, Räuber = angreifen, Mauer/Turm = Stellung beziehen, F = frei |
| Lager | Maus drüber = Inhalt; anklicken = Waren umlagern |
| Kamera | Mausrad zoomen, rechte/mittlere Taste ziehen oder WASD verschieben, H = zur Burg |
| Zeit | Leertaste Pause, 1–3 Tempo |

## Spielsysteme
- **Vier Bedürfnisse:** Nahrung, Unterkunft, Wärme (Brennholz im Herbst/Winter), Sicherheit → Zufriedenheit →
  Zuzug/Wegzug. Steuer in drei Stufen.
- **Jahreszeiten:** Felder werden im Frühling gesät, im Spätsommer geerntet; der Winter lebt vom Vorrat.
- **Wirtschaft:** Bauernhof (+Felder), Viehhof (+Weide), Fischer, Holzfäller (fällt echte Bäume, forstet auf),
  Steinbruch, Erzgrube, Waffenschmiede (Speere oder Bögen). Träger und Erntewagen laufen echte Wege.
- **Lager:** Waren liegen in Speicher und Burg; verbraucht wird aus dem nächsten Lager; Speicher können brennen.
- **Militär:** Speerträger und Bogenschützen, Burg 5 und Kaserne 10 Plätze; Rekrut = Waffe + 8 Gold + 1 Bewohner;
  Unterhalt 1 Nahrung + ⅓ Gold pro Tag. Wachtürme schießen. Räuberbanden ab Tag 9, werden größer.
- **Stadtplaner:** gerade Straßen mit Bögen, Wege als ausgetretene Trampelpfade, Gassen als T-Abzweig mit Blocktiefe, dichte Bürgerhäuser am Markt,
  Straßenmarkt mit Rathaus, Brunnen und Ständen, Kirche mit Portal zur Straße; Burg abseits auf ihrem Hügel.
- **Mauern:** Zinnen außen, Wehrgang innen (R tauscht), Wachtürme rasten in die Mauer ein (Eingang innen),
  Rasterpunkte nur im Werkzeug, Torhaus mit zwei Türmen, wo eine Straße die Mauer kreuzt; Soldaten beziehen per Rechtsklick Stellung auf Mauer/Turm/Torhaus. Rote Nadeln zeigen Angreifer.
- **Höfe und Felder:** Felder auch als Trapeze (nutzen Keile an Wegen/Ufern), Hof anklicken zeigt seine Felder.
  Abgebrannte Höfe bleiben Ruine: hilf mit Holz + Gold beim Wiederaufbau, sonst verwildern die Felder in 4 Tagen.
- **Straßen bearbeiten:** Ecken rund / stark rund / eckig, Punkte verschieben (Werkzeug „✎ Bearbeiten“).
- **Kollision:** niemand läuft durch Gebäude, Mauern oder die Burg (nur durchs Tor); übers Wasser nur auf der Brücke.

## Technik
- Reines JavaScript (ES-Module), kein Build, keine Bibliotheken, keine Bilddateien — alle Sprites werden beim Start
  prozedural gezeichnet.
- **Deterministische Simulation** (`sim/`): Ganzzahlen, eigener Zufall, Sinus-Tabelle, Zustand = JSON.
  Alle Eingaben sind **Befehle** mit `spieler` → vorbereitet für Multiplayer im Lockstep (`netz/PROTOKOLL.md`).
- **Darstellung** (`render/`): Gelände-Chunks aus stetigen Rauschfunktionen, Bäume/Gras als vorgezeichnete Chunks,
  Straßenbeläge als Muster, Partikel (Rauch, Feuer, Funken, Schnee), Figuren mit Laufbildern.

| Ordner | Inhalt |
|---|---|
| `sim/` | Regeln: Gelände, Karte, Baumeister, Stadtplaner, Wirtschaft, Lager, Militär, Befehle, Tick |
| `render/` | Kamera, Gelände, Deko, Sprites, Szene |
| `ui/`, `eingabe/` | Oberfläche, Maus und Tastatur |
| `netz/` | lokale Verbindung, Multiplayer-Plan |
| `data/` | alle Spielzahlen und Gebäudearten |
| `tests/` | Simulationstests und Balance-Bots |
| `tools/stadtplan.mjs` | Messwerkzeug des Stadtplaners (Textkarte + Kennzahlen) |
| `.claude/skills/stadtplaner/` | Skill „Stadtplaner“ mit Lernbuch |
| `.claude/skills/entwicklerteam/` | Routine einer Entwicklungsrunde (Meetings, Testrunde, Training) |
| `.claude/agents/`, `.claude/team/` | Experten des Teams, Lernbücher, Protokolle, Fehlerkatalog |

## Entwicklerteam
Das Projekt wird von einem kleinen Team aus Fachleuten (KI-Agenten) entwickelt; die Projektleitung ist der Haupt-Agent.
Jede Runde folgt der Routine `.claude/skills/entwicklerteam/SKILL.md`: **Kickoff → (Frühwarnung) → Umsetzung →
Zwischenstand → Testrunde → Retrospektive/Training**, schriftlich in `.claude/team/protokolle/`.

| Rolle | Gebiet |
|---|---|
| Projektleitung | Wünsche aufnehmen, Reihenfolge, Meetings, Abnahme, HANDOFF/PROJEKT |
| Stadtplaner | Straßen, Gassen, Bauplätze, Häuserzeilen, Markt, Dichte |
| Grafiker | Sprites, Szene, Lesbarkeit, Jahreszeiten |
| Simulation | Determinismus, Raster, Kollision, Wegfindung, Leistung |
| Ökonom & Historiker | Wirtschaft, Balance, Spielwerte, historische Recherche |
| Feldherr | Mauern, Tore, Türme, Kampf, Räuber |
| Bedienung | Werkzeuge, Maus/Tastatur, Fenster, Hilfe |
| Prüfer | Tests, Testrunden, Code-Durchsicht, Browser-Prüfung |

Jede Rolle führt ein **Lernbuch** (`.claude/team/lernbuecher/`, Stadtplaner im Skill-Ordner) — vor der Arbeit lesen,
danach Eintrag; jede 3. Runde eine Trainingsrunde (Einträge zu Regeln verdichten). Rollenübergreifende Fehler:
`.claude/team/fehlerkatalog.md`. Überblick: `.claude/team/TEAM.md`, Experten: `.claude/agents/`.

## Dokumente
- `KONZEPT.md` — Spielidee und Zahlen · `HANDOFF.md` — aktueller Stand und Verlauf · `CLAUDE.md` — Regeln für KI-Agenten
- `netz/PROTOKOLL.md` — Multiplayer-Plan · `.claude/skills/stadtplaner/LERNBUCH.md` — was der Stadtplaner gelernt hat
- `fehler.log` — Browser-Fehler aus Spieltests (nicht im Git)
