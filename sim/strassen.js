/**
 * strassen.js — Straßen anlegen (aus Kachelwegen geglättete Linien).
 *
 * ZWECK:    Straße hinzufügen, Tore setzen, wo Straßen Mauern kreuzen, Gebäude anbinden.
 * SCHREIBT: z.strassen, z.version, Mauer-Art (→ 'tor')
 * REGEL:    Punkte ganzzahlig in Milli-Kacheln, flach [x0,y0,x1,y1,…].
 */

import { KARTE_B } from '../data/werte.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { abgeleitet } from './abgeleitet.js';
import { findePfad } from './pfad.js';
import { kachel, abstandStrecke } from './lib.js';
import { begradigen } from './stadtplaner.js';

export const BREITE = { haupt: 950, gasse: 700, weg: 560 };

/** Kachelweg → geglättete Punktliste (jede 2. Kachel, dann Chaikin). */
export function punkteAusPfad(pfad, startPunkt, endPunkt) {
  const roh = [];
  if (startPunkt) roh.push(startPunkt.x, startPunkt.y);
  for (let i = 0; i < pfad.length; i++) {
    if (i % 2 === 1 && i !== pfad.length - 1) continue;
    const k = pfad[i];
    roh.push((k % KARTE_B) * 1000 + 500, Math.floor(k / KARTE_B) * 1000 + 500);
  }
  if (endPunkt) roh.push(endPunkt.x, endPunkt.y);
  return glaetten(roh);
}

/** Rohe Punktliste → ohne Doppelte, einmal nach Chaikin geglättet (Endpunkte bleiben). */
export function glaetten(roh) {
  const p = [roh[0], roh[1]];
  for (let i = 2; i < roh.length; i += 2) if (roh[i] !== p[p.length - 2] || roh[i + 1] !== p[p.length - 1]) p.push(roh[i], roh[i + 1]);
  if (p.length <= 4) return p;
  const out = [p[0], p[1]];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    out.push(Math.trunc((3 * ax + bx) / 4), Math.trunc((3 * ay + by) / 4), Math.trunc((ax + 3 * bx) / 4), Math.trunc((ay + 3 * by) / 4));
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}

export function strasseHinzufuegen(z, punkte, art) {
  if (punkte.length < 4) return null;
  const s = { id: z.strassen.length, punkte, breite: BREITE[art], art };
  z.strassen.push(s);
  z.version++;
  toreSetzen(z);
  return s;
}

/** Mauerstücke, die eine Straße berühren, werden zu Toren. */
export function toreSetzen(z) {
  let geaendert = false;
  for (const g of z.gebaeude) {
    if (g.zustand === 'weg' || !GEBAEUDE[g.art].mauer || g.art === 'tor') continue;
    if (mauerKreuztStrasse(z, g)) { g.art = 'tor'; g.hpMax = GEBAEUDE.tor.hp; g.hp = Math.min(g.hp, g.hpMax); if (g.zustand === 'fertig') g.hp = g.hpMax; geaendert = true; }
  }
  if (geaendert) z.version++;
}

export function mauerKreuztStrasse(z, g) {
  const c = abgeleitet(z);
  for (const s of c.segmente) {
    if (g.x + g.b < s.x0 || g.x - g.b > s.x1 || g.y + g.b < s.y0 || g.y - g.b > s.y1) continue;
    if (abstandStrecke(g.x, g.y, s.ax, s.ay, s.bx, s.by) < s.hb + 350) return true;
  }
  return false;
}

/** Verbindet die Tür eines Gebäudes mit dem nächsten Weg, falls keiner nah ist. */
export function anbinden(z, g, tuerPunkt) {
  const c = abgeleitet(z);
  const t = kachel(tuerPunkt.x, tuerPunkt.y);
  if (c.strDist[t] <= 1) return;
  const pfad = findePfad(z, t, -1, 'bau', { zielFn: (i) => c.strasse[i] === 1, max: 20000, erlaubt: new Set([g.id]) });
  if (!pfad || pfad.length < 2) return;
  pfad.reverse();
  strasseHinzufuegen(z, begradigen(z, pfad, null, tuerPunkt), 'weg');
}
