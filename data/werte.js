/**
 * werte.js — Alle Spielzahlen an einer Stelle.
 *
 * ZWECK:    Balance ändern, ohne Logik anzufassen.
 * REGEL:    Nur Ganzzahlen (Simulation ist deterministisch). Positionen in Milli-Kacheln.
 *           Nach Änderungen: node tests/sim.test.js (Bot-Verläufe ansehen).
 */

export const TICKS_PRO_SEKUNDE = 10;
export const TICKS_PRO_TAG = 600;
export const TAGE_PRO_JAHRESZEIT = 5;
export const JAHRESZEITEN = ['Frühling', 'Sommer', 'Herbst', 'Winter'];

export const KARTE_B = 128;
export const KARTE_H = 96;
/** Höhe 0..1000; darunter ist Wasser. */
export const WASSERSPIEGEL = 300;
/** Herrschaftsgebiet: Kacheln um die Burg, in denen ausgeschrieben und gebaut werden darf. */
export const LAND_RADIUS = 40;

export const STADTNAME = 'Eschenbrück';
export const FLUSSNAME = 'Ilmbach';

export const ZIEL = { garnison: 25, satteTage: 5 };
export const NIEDERLAGE_BEWOHNER = 10;

export const START = {
  bewohner: 30,
  soldaten: 3,
  laune: 70,
  /** Startbestände: die Burg hat ihr eigenes Lager (Schatzkammer, Rüstkammer). */
  burg: { nahrung: 60, holz: 0, stein: 0, eisen: 0, speere: 4, boegen: 2, gold: 160 },
  speicher: { nahrung: 280, holz: 70, stein: 25, eisen: 0, speere: 0, boegen: 0, gold: 0 },
  haeuser: 5, hoefe: 2, holzfaeller: 1,
};

export const BEDARF = {
  /** Wärme: Brennholz pro Tag = ceil(Häuser × Faktor / 2) je Jahreszeit. */
  brennholzFaktor: [0, 0, 1, 2],
  gewicht: { nahrung: 35, wohnen: 25, waerme: 20, sicherheit: 20 },
  /** Soldaten für volle Sicherheit: ein Soldat je so viele Bewohner. */
  bewohnerProSoldat: 4,
  turmSchutzRadius: 9000,
  ueberfallMalus: 35,
  ueberfallMalusAbbau: 7,
};

/** Gold pro Tag = floor(Bewohner / teiler). */
export const STEUER = [
  { name: 'niedrig', teiler: 6, laune: 8 },
  { name: 'mittel', teiler: 4, laune: 0 },
  { name: 'hoch', teiler: 3, laune: -12 },
];

export const ZUZUG = { abLaune: 50, wegzugUnter: 35, maxProTag: 5 };

/** Sold pro Tag = ceil(Soldaten / soldTeiler). */
export const MILITAER = {
  soldTeiler: 3,
  anwerben: { gold: 8, ticks: 300 },
  burgPlaetze: 5,
};

export const FELD = {
  reifeTicks: 5000,
  saeArbeit: 200,
  ernteArbeit: 300,
  ertrag: 60,
  /**
   * Feldpflege zwischen Saat und Ernte (hacken, jäten, Steine lesen, Vögel verscheuchen): 1 Bauer je Hof.
   * Pflege 0..100 je Feld; so viele Arbeiter-Ticks je Pflegepunkt; volle Pflege = so viel % mehr Ertrag.
   */
  pflegeTicks: 25,
  pflegeBonus: 25,
  /**
   * Felder wachsen nach dem Anlegen, bis Straße, Nachbar, Zonenrand oder Grenze erreicht ist (Flickenteppich).
   * Flächen in Milli-Kacheln² (1 Kachel² = 1 000 000). Ertrag und Arbeit wachsen mit der Fläche:
   * ein Feld der Größe `basis` (2,7 × 3,9 Kacheln) bringt genau `ertrag`.
   */
  basis: 10530000,
  maxFeld: 36000000,
  maxHof: 100000000,
};

/**
 * Abgebrannter Hof: bleibt als Ruine stehen und wird NICHT von selbst neu gebaut. Der Herr kann beim Wiederaufbau
 * helfen (hilfe: Waren aus dem Lager; dann ist schon bauAnteil % der Bauarbeit getan). Ohne Hilfe verwildern die
 * Felder in verfallTage Tagen; danach ist der Grund wieder frei.
 */
export const HOF_BRAND = { hilfe: { holz: 10, gold: 15 }, bauAnteil: 50, verfallTage: 4 };

/** Weiden wachsen wie Felder; der Viehhof erzeugt mit der Weidefläche mehr (höchstens doppelt so viel). */
export const WEIDE = { basis: 22080000, maxFeld: 50000000 };

/** Wegebau des Baumeisters: je Zone höchstens ein neuer Weg in dieser Zeit; Feldweg-Achsen höchstens so lang. */
export const WEGE = { abstandTicks: 600, achseMax: 34000, zufahrtMax: 20000 };

export const WALD = {
  /** Wald pro Kachel 0..100; ein Baum = 25. Pro Holz-Einheit wird so viel gefällt. */
  proHolz: 12,
  radius: 6,
  aufforsten: 10,
  nachwachsen: 2,
};

/** Träger: so viel auf einmal; Puffer am Gebäude höchstens das Doppelte. */
export const TRAGEN = 10;
/** Erntewagen der Höfe: so viel pro Fahrt, so viele Wagen gleichzeitig. */
export const WAGEN = { menge: 25, anzahl: 2 };

/** Geschwindigkeit in Milli-Kacheln pro Tick. */
export const TEMPO = { traeger: 140, soldat: 150, raeuber: 110 };

export const KAMPF = {
  soldat: { hp: 100, schaden: [9, 15], takt: 10, reichweite: 1100 },
  raeuber: { hp: 70, schaden: [6, 11], takt: 11, reichweite: 1100 },
  bogner: { hp: 70, schaden: [7, 11], takt: 16, reichweite: 4500 },
  turm: { schaden: 12, takt: 14, reichweite: 6500 },
  burg: { schaden: 12, takt: 12, reichweite: 7500 },
  mauerSchaden: 8,
  /** Wer auf Mauer oder Turm steht, reicht weiter (Milli-Kacheln). */
  mauerReichweiteBogen: 1500,
  /** Nahkämpfer auf Mauer oder Turm werfen Steine hinunter (viel kürzer als Bögen). */
  steinwurf: { reichweite: 2500, schaden: [6, 10], takt: 14 },
  /**
   * Heilung: In und an Burg oder Kaserne (Feldscher, Lager) 1 Leben je heilTakt Ticks; draußen nur je 20–30 Ticks.
   * Wer unter heilenAb % Leben hat und nicht kämpft, geht von selbst dorthin (nur Soldaten auf eigene Faust).
   */
  heilTakt: 3,
  heilenAb: 70,
  heilRadius: 3500,
  pluenderTakt: 20,
  pluenderSchaden: 4,
  beuteMax: 12,
  sichtRaeuber: 2500,
};

export const UEBERFALL = {
  ersterTag: 9,
  abstandTage: [6, 8],
  basis: 3,
  proUeberfall: 2,
  proBewohner: 25,
};

/** Baumeister: alle so viele Ticks einmal planen. */
export const PLANUNG_TAKT = 100;
