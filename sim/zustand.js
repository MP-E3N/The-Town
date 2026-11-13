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
import { strasseHinzufuegen } from './strassen.js';
import { begradigen, nurNeuerTeil } from './stadtplaner.js';
import { gebaeudeAnlegen, findePlatz, planeGasse, tuer, tuerKachel, pruefePlatz } from './baumeister.js';
import { neuerSoldat } from './militaer.js';
import { arbeitVerteilen } from './wirtschaft.js';
import { leer, summieren } from './lager.js';
import { winkelVon, wnorm, kachel, abstand, lokal, SIN, COS } from './lib.js';

function neuerHerr(id, name) {
  return {
    id, name, burg: -1, markt: -1, lager: leer(), bewohner: START.bewohner, laune: START.laune,
    steuer: 1, arbeitslos: 0, beduerfnisse: { nahrung: 100, wohnen: 100, waerme: 100, sicherheit: 50 },
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

/**
 * Marktplatz als „Straßenmarkt“: länglich entlang der Handelsstraße. Rathaus mit offener Halle an der
 * Längsseite (Front zum Platz), Kirche in Sichtweite — wie in vielen Gründungsstädten des Hochmittelalters.
 */
function marktAnlegen(z, k, platz, burg, handel) {
  if (handel.length === 2) {
    const a = handel[0][Math.min(5, handel[0].length - 1)], b = handel[1][Math.min(5, handel[1].length - 1)];
    platz.w = winkelVon((b % KARTE_B) - (a % KARTE_B), Math.floor(b / KARTE_B) - Math.floor(a / KARTE_B));
    z.version++;
  }
  // Rathaus auf der Längsseite, die der Burg abgewandt ist
  const vx = -SIN[platz.w], vy = COS[platz.w];
  const burgSeite = (burg.x - platz.x) * vx + (burg.y - platz.y) * vy > 0 ? 1 : -1;
  const seite = -burgSeite;
  const r = GEBAEUDE.rathaus;
  for (const lu of [0, -1500, 1500, -2500, 2500]) {
    const lv = seite * (Math.floor(platz.t / 2) + Math.floor(r.t / 2) + 150);
    const p = lokal(platz, lu, lv);
    const o = { x: p.x, y: p.y, b: r.b, t: r.t, w: wnorm(seite > 0 ? platz.w : platz.w + 180) };
    if (!pruefePlatz(z, 0, o, { steilMax: 120, strRand: 40, rand: 60 })) { gebaeudeAnlegen(z, 0, 'rathaus', o, { sofort: true, keinWeg: true }); break; }
  }
  // Kirche: nahe am Markt, ungefähr geostet (Turm/Portal im Westen, Chor im Osten), das Portal an einer Straße.
  // WARUM nicht exakt 270°: Viele Stadtkirchen weichen der Straßenflucht zuliebe ab; ein Portal, das ins Feld
  // oder zum Fluss zeigt, wirkt falsch. Bewertet: Nähe zum Platz, Portal nah an Straße/Platz, wenig Abweichung,
  // Abstand zu Wasser und Burg.
  const kt = GEBAEUDE.kirche;
  const c = abgeleitet(z);
  let kirche = null, bw = Infinity;
  for (let rr = 3500; rr <= 10500; rr += 500) {
    for (let a = 0; a < 360; a += 15) {
      const x = platz.x + Math.trunc(COS[a] * rr / 1024), y = platz.y + Math.trunc(SIN[a] * rr / 1024);
      for (const w of [270, 255, 285, 240, 300]) {
        const o = { x, y, b: kt.b, t: kt.t, w };
        if (pruefePlatz(z, 0, o, { steilMax: 90, strRand: 200, rand: 400 })) continue;
        const p = tuer(o), tk = kachel(p.x, p.y);
        if (tk < 0 || tk >= k.wasser.length || k.wasser[tk]) continue;
        const portal = c.strDist[tk];
        if (portal > 3) continue;
        let nass = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const t = kachel(x + dx * 1000, y + dy * 1000); if (t >= 0 && t < k.wasser.length && k.wasser[t]) nass++; }
        const wert = rr + portal * 1500 + Math.abs(w - 270) * 60 + nass * 900 - Math.min(abstand(x, y, burg.x, burg.y), 14000) / 4;
        if (wert < bw) { bw = wert; kirche = o; }
      }
    }
  }
  if (kirche) gebaeudeAnlegen(z, 0, 'kirche', kirche, { sofort: true });
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
  // Erst die Handelsstraße durch den Markt (über den Fluss: Brücke), dann der Burgweg.
  // WARUM diese Reihenfolge + nurNeuerTeil: Sonst läuft der Burgweg ein Stück neben der Handelsstraße her
  // (zwei parallele Straßen). So mündet er als T-Kreuzung in die Handelsstraße.
  const mk = kachel(k.markt.x, k.markt.y);
  const my = Math.floor(k.markt.y / 1000);
  const handel = [];
  for (const links of [true, false]) {
    const p = findePfad(z, mk, randZiel(k, links, my), 'bau');
    if (p) { strasseHinzufuegen(z, begradigen(z, nurNeuerTeil(z, p), null, null), 'haupt', 'handel'); handel.push(p); }
  }
  const p1 = findePfad(z, tuerKachel(burg), mk, 'bau');
  if (p1) strasseHinzufuegen(z, begradigen(z, nurNeuerTeil(z, p1), tuer(burg), null), 'haupt', 'burgweg');
  marktAnlegen(z, k, platz, burg, handel);
  // Erste Zonen
  const mx = Math.floor(k.markt.x / 1000);
  zoneKreis(z, k, burg, mx, my, 10, 1, 50);
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
      // WARUM kein Abbruch beim ersten Fehlschlag: planeGasse merkt sich das Ziel und versucht beim nächsten Mal ein anderes.
      for (let v = 0; v < 6 && !p; v++) { if (planeGasse(z, 0, GEBAEUDE[art].zone)) p = findePlatz(z, 0, art); }
      if (!p) break;
      gebaeudeAnlegen(z, 0, art, p.o, { sofort: true, felder: p.felder, wohn: p.wohn });
    }
  };
  setze('hof', START.hoefe);
  setze('holzfaeller', START.holzfaeller);
  // Zweiter Versuch: Der Weg zum Holzfäller erschließt manchmal erst das Ackerland.
  setze('hof', START.hoefe - z.gebaeude.filter((g) => g.art === 'hof').length);
  // Häuser, bis alle Startbewohner ein Dach haben (Bürgerhäuser am Markt fassen mehr)
  for (let n = 0; n < 10; n++) {
    const kap = z.gebaeude.reduce((a, g) => a + (g.art === 'haus' ? g.wohn || 5 : 0), 0);
    if (kap >= START.bewohner + 4 && n >= START.haeuser - 1) break;
    setze('haus', 1);
  }
  for (let i = 0; i < START.soldaten; i++) neuerSoldat(z, 0, burg);
  // Startlager setzen (Rodung beim Aufbau zählt nicht): Burg und erster Speicher getrennt.
  for (const g of z.gebaeude) if (g.inhalt) g.inhalt = leer();
  burg.inhalt = { ...START.burg };
  const speicher = z.gebaeude.find((g) => g.art === 'speicher');
  const ziel = speicher || burg;
  for (const w in START.speicher) ziel.inhalt[w] += START.speicher[w];
  summieren(z, 0);
  abgeleitet(z);
  arbeitVerteilen(z, 0);
  return z;
}
