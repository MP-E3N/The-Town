/**
 * zustand.js — Startzustand: Burg, Markt, Straßen, erste Zonen, erste Häuser und Höfe.
 *
 * ZWECK:    Aus einem Seed eine spielbereite Stadt erzeugen. Die ersten Gebäude setzt derselbe
 *           Baumeister, der später weiterbaut (sofort fertig).
 * REGEL:    Zustand = reines JSON. Listen mit Index = ID (Gebäude, Felder, Straßen).
 */

import { KARTE_B, KARTE_H, LAND_RADIUS, START, UEBERFALL, TICKS_PRO_TAG, STADTNAME } from '../data/werte.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { karteFuer } from './karte.js';
import { abgeleitet } from './abgeleitet.js';
import { findePfad } from './pfad.js';
import { strasseHinzufuegen, punkteAusPfad } from './strassen.js';
import { gebaeudeAnlegen, findePlatz, planeGasse, tuer, tuerKachel } from './baumeister.js';
import { neuerSoldat } from './militaer.js';
import { arbeitVerteilen } from './wirtschaft.js';
import { winkelVon, wnorm, kachel, abstand } from './lib.js';

function neuerHerr(id, name) {
  return {
    id, name, burg: -1, markt: -1, lager: { ...START.lager }, bewohner: START.bewohner, laune: START.laune,
    steuer: 1, anwerben: true, arbeitslos: 0, beduerfnisse: { nahrung: 100, wohnen: 100, waerme: 100, sicherheit: 50 },
    ueberfallMalus: 0, sammelpunkt: null, satteTage: 0, heute: {}, gestern: {}, chronik: [], meldeSperre: {}, planLog: [],
  };
}

function zoneKreis(z, k, burg, tx, ty, r, zone, steilMax = 60) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r) continue;
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= KARTE_B || y >= KARTE_H) continue;
    const i = y * KARTE_B + x;
    if (k.wasser[i] || k.steil[i] > steilMax) continue;
    if (abstand(x * 1000 + 500, y * 1000 + 500, burg.x, burg.y) > LAND_RADIUS * 1000) continue;
    z.zone[i] = zone;
  }
}

function bestesGebiet(z, k, burg, markt, rMin, rMax, wertFn) {
  const mx = Math.floor(markt.x / 1000), my = Math.floor(markt.y / 1000);
  let best = null, bw = -Infinity;
  for (let ty = 2; ty < KARTE_H - 2; ty += 2) for (let tx = 2; tx < KARTE_B - 2; tx += 2) {
    const d = Math.sqrt((tx - mx) * (tx - mx) + (ty - my) * (ty - my));
    if (d < rMin || d > rMax) continue;
    if (abstand(tx * 1000, ty * 1000, burg.x, burg.y) > (LAND_RADIUS - 6) * 1000) continue;
    let w = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= KARTE_B || y >= KARTE_H) continue;
      w += wertFn(y * KARTE_B + x);
    }
    w -= d * 3;
    if (w > bw) { bw = w; best = { tx, ty }; }
  }
  return best;
}

function randZiel(k, links, y0) {
  const x = links ? 0 : KARTE_B - 1;
  for (let d = 0; d < KARTE_H; d++) for (const s of [1, -1]) {
    const y = y0 + d * s;
    if (y >= 1 && y < KARTE_H - 1 && !k.wasser[y * KARTE_B + x] && k.steil[y * KARTE_B + x] < 40) return y * KARTE_B + x;
  }
  return y0 * KARTE_B + x;
}

export function erzeugeZustand(seed) {
  const k = karteFuer(seed);
  const z = {
    version: 1, zonenVersion: 1, seed, tick: 0, rng: (seed * 2654435761) >>> 0 || 1, stadt: STADTNAME,
    herren: [neuerHerr(0, 'Herr von ' + STADTNAME)],
    gebaeude: [], felder: [], strassen: [], zone: new Array(KARTE_B * KARTE_H).fill(0), wald: Array.from(k.waldStart),
    einheiten: [], banden: [], lieferungen: [], ruinen: [], ereignisse: [], ereignisNr: 0,
    naechsteEinheit: 0, naechsteLieferung: 0, gasseVersucht: [], ueberfallNr: 0,
    naechsterUeberfall: UEBERFALL.ersterTag * TICKS_PRO_TAG + 200, ergebnis: null,
  };
  const h = z.herren[0];
  const dir = winkelVon(k.markt.x - k.burg.x, k.markt.y - k.burg.y);
  const burg = gebaeudeAnlegen(z, 0, 'burg', { x: k.burg.x, y: k.burg.y, b: GEBAEUDE.burg.b, t: GEBAEUDE.burg.t, w: wnorm(dir + 90) }, { sofort: true, keinWeg: true });
  h.burg = burg.id;
  const platz = gebaeudeAnlegen(z, 0, 'platz', { x: k.markt.x, y: k.markt.y, b: GEBAEUDE.platz.b, t: GEBAEUDE.platz.t, w: wnorm(dir + 90) }, { sofort: true, keinWeg: true });
  h.markt = platz.id;
  // Burgweg und Handelsstraße (über den Fluss: Brücke)
  const mk = kachel(k.markt.x, k.markt.y);
  const p1 = findePfad(z, tuerKachel(burg), mk, 'bau');
  if (p1) strasseHinzufuegen(z, punkteAusPfad(p1, tuer(burg), null), 'haupt');
  const my = Math.floor(k.markt.y / 1000);
  for (const links of [true, false]) {
    const p = findePfad(z, mk, randZiel(k, links, my), 'bau');
    if (p) strasseHinzufuegen(z, punkteAusPfad(p, null, null), 'haupt');
  }
  // Erste Zonen
  const mx = Math.floor(k.markt.x / 1000);
  zoneKreis(z, k, burg, mx, my, 8, 1, 45);
  const acker = bestesGebiet(z, k, burg, k.markt, 9, 22, (i) => (k.wasser[i] || k.steil[i] > 40 || z.wald[i] >= 50 || z.zone[i]) ? -40 : k.frucht[i]);
  if (acker) zoneKreis(z, k, burg, acker.tx, acker.ty, 7, 2, 50);
  const forst = bestesGebiet(z, k, burg, k.markt, 7, 20, (i) => (z.zone[i] ? -50 : z.wald[i]));
  if (forst) zoneKreis(z, k, burg, forst.tx, forst.ty, 4, 4, 60);
  z.zonenVersion++;
  // Speicher am Markt
  const sp = findePlatz(z, 0, 'speicher');
  if (sp) gebaeudeAnlegen(z, 0, 'speicher', sp.o, { sofort: true });
  const setze = (art, n) => {
    for (let i = 0; i < n; i++) {
      let p = findePlatz(z, 0, art);
      for (let v = 0; v < 6 && !p; v++) { if (!planeGasse(z, 0, GEBAEUDE[art].zone)) break; p = findePlatz(z, 0, art); }
      if (!p) break;
      gebaeudeAnlegen(z, 0, art, p.o, { sofort: true, felder: p.felder });
    }
  };
  setze('hof', START.hoefe);
  setze('holzfaeller', START.holzfaeller);
  setze('haus', START.haeuser);
  for (let i = 0; i < START.soldaten; i++) neuerSoldat(z, 0, burg);
  // Startlager wieder auf den Sollwert (Rodung beim Aufbau zählt nicht)
  h.lager = { ...START.lager };
  abgeleitet(z);
  arbeitVerteilen(z, 0);
  return z;
}
