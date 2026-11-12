# Lehnsherr von Eschenbrück — Konzept

## Idee in einem Satz
Du bist der Herr von **Burg Eschenbrück** über der Stadt **Eschenbrück am Ilmbach**. Du baust die Stadt
nicht selbst — du **schreibst Land aus** (Wohnland, Acker, Weide, Forst, Bergbau). Der Baumeister des
Spiels legt dort Gassen, Höfe, Häuser und Felder an, natürlich und dem Gelände folgend. Du selbst gibst nur
**militärische Bauten** in Auftrag (Kaserne, Wachturm, Waffenschmiede, Palisade, Steinmauer) und sorgst
dafür, dass deine Leute satt, warm, untergebracht und sicher sind.

## Ziel der Demo
1. **Die Stadt ernähren:** 5 Tage am Stück (= eine Jahreszeit) bekommt jeder Bewohner und Soldat sein Essen.
2. **Eine Garnison von 25 Mann** aufstellen.
Beides gleichzeitig = Sieg. Fällt die Bevölkerung unter 10, ist die Stadt verlassen (Niederlage).

## Zeit
- 10 Ticks pro Sekunde, 1 Tag = 600 Ticks (1 Minute bei Tempo 1). Tempo 1 / 2 / 4, Pause.
- 5 Tage je Jahreszeit, 4 Jahreszeiten (Frühling, Sommer, Herbst, Winter) = 20 Tage pro Jahr.
- Felder werden im Frühling (und frühen Sommer) gesät, wachsen ~8 Tage und werden im Spätsommer/Herbst
  geerntet. Was im Winter noch auf dem Feld steht, verdirbt. **Der Winter muss aus dem Speicher leben.**

## Die vier Bedürfnisse
| Bedürfnis | erfüllt durch | Gewicht |
|---|---|---|
| **Nahrung** | 1 Nahrung pro Kopf und Tag aus dem Speicher (Soldaten essen zuerst) | 35 % |
| **Unterkunft** | Plätze in Häusern (5 je Haus); Soldaten wohnen in Burg/Kaserne | 25 % |
| **Wärme** | Brennholz im Herbst (½ je Haus/Tag) und Winter (1 je Haus/Tag) | 20 % |
| **Sicherheit** | Soldaten im Verhältnis zur Bevölkerung, Türme in der Nähe der Häuser, Mauern; Überfälle drücken sie | 20 % |

Daraus folgt die **Zufriedenheit** (0–100). Ab 50 ziehen Leute zu (wenn Wohnraum da ist), unter 35 ziehen
Leute weg, Hunger vertreibt sofort Bewohner. Die Steuer (niedrig/mittel/hoch) verschiebt Gold gegen Laune.

## Wirtschaft (bewusst einfach)
Waren: **Nahrung, Holz, Stein, Eisen, Speere, Bögen, Gold.** Jede Ware liegt in einem echten Lager (Speicher oder Burg);
verbraucht wird aus dem nächstgelegenen Lager. Der Herr kann Waren zwischen Lagern umlagern lassen.
| Gebäude | Zone | Arbeiter | erzeugt |
|---|---|---|---|
| Bauernhof + 2–4 Felder | Ackerland | 2 | Nahrung zur Ernte (Ertrag nach Fruchtbarkeit) |
| Viehhof + Weide | Weideland | 2 | Nahrung das ganze Jahr, wenig |
| Fischerhütte | Wohnland am Wasser | 1 | Nahrung, im Winter wenig |
| Holzfäller (+ Aufforsten) | Forst | 2 | Holz, fällt echte Bäume der Karte |
| Steinbruch | Bergbau auf Fels | 2 | Stein |
| Erzgrube | Bergbau auf Erz | 2 | Eisen |
| Waffenschmiede (Auftrag des Herrn) | frei | 2 | Speere (Holz + Eisen) oder Bögen (2 Holz), wählbar |
Waren werden von **Trägern** über die Wege zum Speicher gebracht — weite Wege kosten Zeit.
Arbeiter werden automatisch verteilt: Nahrung → Holz → Baustellen → Stein → Eisen → Schmiede.

## Der Baumeister (das Spiel plant, nicht der Spieler)
- Alle ~10 Sekunden prüft er: Wohnraum knapp? Nahrung knapp? Holz knapp? Leute ohne Arbeit?
- Er sucht Bauplätze **entlang vorhandener Straßen**, Front zur Straße, leicht gedreht, mit Abstand —
  kein Raster. Hang, Wasser, Fels und Nachbarn werden geprüft (gedrehte Rechtecke, SAT-Test).
- Reicht der Platz nicht, legt er eine **neue Gasse** an: vom nächsten Weg ins Zonengebiet, dem Gelände
  folgend (Wegsuche mit Hangkosten), danach in die Zone hinein verlängert.
- Höfe bekommen **Felder hinter dem Hof** (gedrehte Streifen, je nach Gelände 2–4).
- Militärische Aufträge des Herrn werden zuerst mit Bauleuten besetzt; sie bekommen automatisch einen Weg.

## Militär
- **Burg:** 5 Plätze, schießt mit Bogenschützen. Burg und Kaserne bilden wahlweise Speerträger oder Bogenschützen aus.
- **Führung wie im RTS:** Soldaten auswählen, per Rechtsklick marschieren/halten oder angreifen; sonst verteidigen sie selbstständig.
- **Kaserne:** 10 Plätze, wirbt an (1 Waffe + 8 Gold +
  1 Bewohner). Für 25 Mann braucht es Burg + 2 Kasernen.
- **Wachturm:** schießt Pfeile (Reichweite ~6 Kacheln), schützt Häuser in der Nähe (Sicherheit).
- **Palisade (Holz) / Steinmauer (Stein):** als Linie gezogen; wo sie eine Straße kreuzt, entsteht ein **Tor**.
  Räuber müssen Mauern einreißen, eigene Leute gehen durch Tore.
- **Sold:** ⅓ Gold pro Soldat und Tag. Ohne Gold desertieren Soldaten.
- **Räuberbanden** kommen ab Tag 9 alle 6–8 Tage vom Kartenrand, größer je Überfall und je größer die Stadt.
  Sie plündern Speicher, Höfe und Häuser, setzen sie in Brand und ziehen mit Beute ab.
  Soldaten rücken automatisch aus (oder zum **Sammelpunkt**), Türme schießen.

## Darstellung
- 2D-Draufsicht, Zoom von der ganzen Karte bis ganz nah (6–128 Pixel pro Kachel).
- Gelände aus stetigen Rauschfunktionen → scharfe Ufer und Hänge in jeder Zoomstufe, Schattierung,
  Körnung; in Kacheln (Chunks) vorgerendert und zwischengespeichert.
- Alle Sprites (Dächer, Burg, Bäume, Figuren mit Laufbildern, Tiere) werden beim Start **prozedural einmal
  gezeichnet** und danach nur noch kopiert/gedreht → schnell.
- Animationen: Träger, Bauern auf dem Feld, Holzfäller mit Axt, fallende Bäume, Bauleute, Rauch aus
  Schornsteinen (im Winter mehr), Funken an der Schmiede, Schafe/Kühe auf der Weide, Pfeile, Feuer,
  Schneefall, Schnee auf Dächern, Jahreszeiten-Farben der Bäume.

## Multiplayer-Vorbereitung
Wie in den Schwesterprojekten: Simulation deterministisch (Ganzzahlen, eigener Zufall, Sinus-Tabelle),
Zustand reines JSON, alle Eingaben als **Befehle** mit `spieler`. Mehrere **Herren** sind im Zustand
angelegt (`z.herren[]`, `gebaeude.besitzer`, eigene Lager/Zonen-Besitz), die Demo nutzt einen.
Plan für Lockstep über WebSocket: `netz/PROTOKOLL.md`.

## Später (nicht in der Demo)
Mehrere Herren auf einer Karte (Grenzen, Handel, Fehde), Mühle/Bäcker-Ketten, Kirche/Glaube als
5. Bedürfnis, Markttage und Händler, zweiter Speicher, Belagerung, Speichern im Browser.
