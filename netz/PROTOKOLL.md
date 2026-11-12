# Multiplayer-Schnittstelle (Plan)

Die Simulation ist deterministisch: gleicher Seed + gleiche Befehle pro Tick = gleicher Zustand auf jedem
Rechner. Darauf baut ein **Lockstep**-Modell auf (wie in den Schwesterprojekten Kronwege/Stadtwacht).

## Was es schon gibt
- `sim/befehle.js` — alle Spieleraktionen als JSON-Befehle mit `spieler` (= Index in `z.herren`).
  Werte werden geprüft und auf Ganzzahlen gebracht (sie können aus dem Netz kommen).
- `z.herren[]` — jeder Herr hat eigenes Lager, Bewohner, Laune, Steuer, Sammelpunkt, Meldungen.
- `gebaeude.besitzer`, `einheit.besitzer` — Abreißen/Befehle an fremde Gebäude werden verworfen.
- Baumeister, Wirtschaft, Tagesabschluss und Überfälle laufen bereits **pro Herr** (Schleifen über `z.herren`).
- `sim/lib.js hashZustand(z)` — Prüfsumme; `netz/lokal.js abspielen()` — Aufnahme nachrechnen.

## Netz-Verbindung (später, gleiche Schnittstelle wie `lokaleVerbindung`)
```
Client                          Server (Node, WebSocket)
senden(befehl) ─────────────►   stempelt spieler + Tick T (= jetzt + 3)
                ◄─────────────  {tick:T, befehle:[…]}   (an alle, sortiert nach spieler, Eingang)
schritt(): erst rechnen, wenn das Paket für den nächsten Tick da ist
alle 60 Ticks: {tick, hash} ──► Server vergleicht, meldet Desync
```
- Pause und Tempo gehören dem Gastgeber.
- Beitritt im laufenden Spiel: Server schickt `JSON.stringify(zustand)` + ausstehende Befehle.

## Was für mehrere Herren noch fehlt
- `erzeugeZustand(seed)` legt heute einen Herrn an. Für mehrere: zweiten Burgplatz suchen
  (gleiche Regeln wie `gelaende.burg`, weit genug weg), `neuerHerr(1, …)`, eigener Markt + Straßen.
- Zonen gehören heute dem Land innerhalb des Burgradius; bei Überlappung braucht es `z.zoneBesitz[]`.
- Räuber greifen heute nur den Herrn ihrer Bande an (`bande.herr`) — passt für Koop.
- Soldaten verfolgen nur Räuber; für Fehden zwischen Herren: Feindschaft pro Herrenpaar.
- Darstellung/UI lesen `z.herren[0]` → `verbindung.spieler` benutzen.
