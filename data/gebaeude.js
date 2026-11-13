/**
 * gebaeude.js — Gebäudearten.
 *
 * Maße b (Breite, entlang der Straße) und t (Tiefe) in Milli-Kacheln. Die Front (Tür) zeigt zur Straße.
 * arbeit = Bau-Arbeitspunkte (1 Bauarbeiter = 1 Punkt pro Tick).
 * ticksProEinheit = Arbeiter-Ticks pro erzeugter Einheit.
 * gruppe = Reihenfolge der Arbeiterverteilung (kleiner = zuerst).
 * auftrag = nur der Herr kann es in Auftrag geben (militärisch); sonst plant der Baumeister.
 */

export const GEBAEUDE = {
  burg: { name: 'Burg Eschenbrück', b: 7000, t: 7000, hp: 3000, plaetze: 5, schiesst: 'burg', lager: true },
  platz: { name: 'Marktplatz', b: 5400, t: 3200, begehbar: true },
  speicher: { name: 'Speicher', b: 2200, t: 2800, kosten: { holz: 30 }, arbeit: 900, hp: 400, lager: true },
  haus: { name: 'Wohnhaus', b: 1150, t: 1600, kosten: { holz: 8 }, arbeit: 450, hp: 150, wohnplaetze: 5, zone: 1 },
  hof: { name: 'Bauernhof', b: 1800, t: 2100, kosten: { holz: 14 }, arbeit: 600, hp: 220, arbeiter: 2, wohnplaetze: 4, zone: 2, ware: 'nahrung', gruppe: 0 },
  viehhof: { name: 'Viehhof', b: 1700, t: 2300, kosten: { holz: 12 }, arbeit: 550, hp: 200, arbeiter: 2, wohnplaetze: 3, zone: 3, ware: 'nahrung', ticksProEinheit: 500, gruppe: 0 },
  fischer: { name: 'Fischerhütte', b: 1100, t: 1300, kosten: { holz: 6 }, arbeit: 300, hp: 120, arbeiter: 1, zone: 1, ware: 'nahrung', ticksProEinheit: 350, gruppe: 0, amWasser: true },
  holzfaeller: { name: 'Holzfäller', b: 1300, t: 1500, kosten: { holz: 6 }, arbeit: 350, hp: 140, arbeiter: 2, zone: 4, ware: 'holz', ticksProEinheit: 220, gruppe: 1 },
  steinbruch: { name: 'Steinbruch', b: 1500, t: 1500, kosten: { holz: 10 }, arbeit: 400, hp: 160, arbeiter: 2, zone: 5, ware: 'stein', ticksProEinheit: 300, gruppe: 3, braucht: 'fels' },
  erzgrube: { name: 'Erzgrube', b: 1500, t: 1600, kosten: { holz: 14 }, arbeit: 500, hp: 180, arbeiter: 2, zone: 5, ware: 'eisen', ticksProEinheit: 600, gruppe: 4, braucht: 'erz' },
  // Aufträge des Herrn
  schmiede: { name: 'Waffenschmiede', b: 1600, t: 1900, kosten: { holz: 15, stein: 10 }, arbeit: 700, hp: 250, arbeiter: 2, ware: 'speere', ticksProEinheit: 600, gruppe: 5, auftrag: true },
  kaserne: { name: 'Kaserne', b: 2800, t: 3400, kosten: { holz: 30, stein: 20, gold: 40 }, arbeit: 1400, hp: 600, plaetze: 10, auftrag: true },
  turm: { name: 'Wachturm', b: 1300, t: 1300, kosten: { holz: 10, stein: 15 }, arbeit: 700, hp: 500, schiesst: 'turm', auftrag: true },
  palisade: { name: 'Palisade', b: 1500, t: 360, kosten: { holz: 3 }, arbeit: 120, hp: 200, mauer: true, auftrag: true },
  mauer: { name: 'Steinmauer', b: 1500, t: 640, kosten: { stein: 4 }, arbeit: 220, hp: 600, mauer: true, auftrag: true },
  rathaus: { name: 'Rathaus', b: 2600, t: 2000, hp: 800 },
  kirche: { name: 'Kirche St. Ilmar', b: 3200, t: 5800, hp: 1000 },
  // Endturm: entsteht von selbst, wo eine Mauer/Palisade an Wasser, Kartenrand oder Fels endet (schließt die Lücke)
  eckturm: { name: 'Mauerturm', b: 1300, t: 1300, arbeit: 300, hp: 450, hpStein: 1000, mauer: true, endturm: true },
  tor: { name: 'Torhaus', b: 3000, t: 1500, kosten: { holz: 4 }, arbeit: 200, hp: 450, hpStein: 1100, mauer: true, tor: true },
};

/** Zonen (z.zone[k]); Index = Zahl im Zustand. */
export const ZONEN = [
  { name: 'keine', farbe: [0, 0, 0] },
  { name: 'Wohnland', farbe: [230, 170, 70] },
  { name: 'Ackerland', farbe: [235, 225, 80] },
  { name: 'Weideland', farbe: [120, 220, 90] },
  { name: 'Forst', farbe: [40, 140, 70] },
  { name: 'Bergbau', farbe: [170, 150, 140] },
];

export const WAREN = ['nahrung', 'holz', 'stein', 'eisen', 'speere', 'boegen', 'gold'];
export const WARENNAME = { nahrung: 'Nahrung', holz: 'Holz', stein: 'Stein', eisen: 'Eisen', speere: 'Speere', boegen: 'Bögen', gold: 'Gold' };

/** Was die Waffenschmiede herstellen kann (Material je Stück). */
export const SCHMIEDE_PRODUKTE = {
  speere: { name: 'Speere', material: { holz: 1, eisen: 1 } },
  boegen: { name: 'Bögen', material: { holz: 2 } },
};

/** Wen Burg und Kaserne ausbilden können. */
export const AUSBILDUNG = {
  speer: { name: 'Speerträger', einer: 'Ein Speerträger', waffe: 'speere', text: 'Nahkämpfer, robust (100 Leben)' },
  bogen: { name: 'Bogenschützen', einer: 'Ein Bogenschütze', waffe: 'boegen', text: 'schießt auf 4,5 Kacheln, schwächer im Nahkampf (70 Leben)' },
};
