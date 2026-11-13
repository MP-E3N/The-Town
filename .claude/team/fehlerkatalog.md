# Fehlerkatalog (rollenübergreifend)

| Runde | Fehlerbild | Ursache | Rollen | Vorbeugung |
|---|---|---|---|---|
| 5 | Figuren laufen durch Häuser | Kollision nur an Kachelmitten | Simulation | 9 Probepunkte je Kachel, Test „Kollision“ |
| 8 | Gärten unter Nachbarhäusern | Garten nur im Bild, nicht in der Simulation | Stadtplaner, Grafiker | Bild = Rechnung (`grundstueck`) |
| 9 | Kirche fehlte auf Seed 42 | größere Kirche, Suchraum zu eng | Stadtplaner | Platzsuche nach Größenänderung auf mehreren Seeds prüfen |
| 9 | Zu viele Straßenpunkte im Bearbeiten | Chaikin-Glättung + Bogenpunkte gespeichert | Stadtplaner, Bedienung | Straßen als Eckpunkte speichern, Rundung macht `strassenLinie` |
| 9 | Restknoten an Mauern (Winter) | Eckkappen als weiße Kreise | Grafiker | Ecken durch Verlängern schließen |
| 10 | Spiel/Tests extrem langsam auf einer Karte | Wegsuche ohne wirksame Wartezeit nach Fehlschlag | Simulation, Prüfer | Laufzeit je Seed messen; Fehlerpfade von Wartezeiten testen |
| 12 | Befehl mit 'constructor' zerstört Gold (NaN) | Tabellenzugriff ohne hasOwn | Simulation, Prüfer | Object.hasOwn für Netz-Schlüssel |
| 12 | Stadtware landet in der Burg, wenn kein Stadtlager steht | Topf-Rückfall in geben() | Simulation | Rückfall nur, wo er keine Spielregel umgeht |
| 13 | Patch-Skript findet Muster nicht | CRLF nach git checkout; kürzeres Muster ersetzte schon längeres | Projektleitung | Zeilenenden normalisieren; Muster eindeutig wählen |
