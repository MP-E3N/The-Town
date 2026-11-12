/**
 * lib.js — Kleine deterministische Helfer der Simulation.
 *
 * ZWECK:    Zufall, Hash, Ganzzahl-Trigonometrie, gedrehte Rechtecke (OBB), Ereignisse.
 * REGEL:    Kein Math.random, kein Date. Winkel in ganzen Grad, Vektoren mit Länge 1024.
 *           WARUM Tabelle: Math.sin kann sich zwischen Browsern im letzten Bit unterscheiden;
 *           gerundet auf 1/1024 ist das praktisch immer gleich, die Simulation rechnet dann nur noch ganzzahlig.
 */

import { KARTE_B } from '../data/werte.js';

/** @param {number} a @param {number} b @param {number} c */
export function hash32(a, b, c) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35) ^ Math.imul((c + 0x165667b1) | 0, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Zufallszahl 0..n-1 aus dem Zustand (mulberry32). */
export function zufall(z, n) {
  z.rng = (z.rng + 0x6D2B79F5) >>> 0;
  let t = z.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) % n);
}
/** Ganzzahl zwischen a und b (inklusive). */
export function zufallZwischen(z, a, b) { return a + zufall(z, b - a + 1); }

export function hashZustand(z) {
  const s = JSON.stringify(z);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const SIN = new Int32Array(360);
export const COS = new Int32Array(360);
for (let d = 0; d < 360; d++) {
  SIN[d] = Math.round(Math.sin(d * Math.PI / 180) * 1024);
  COS[d] = Math.round(Math.cos(d * Math.PI / 180) * 1024);
}
export function wnorm(w) { return ((w % 360) + 360) % 360; }

/** Richtung (dx,dy) → ganze Grad, ohne atan2. */
export function winkelVon(dx, dy) {
  if (dx === 0 && dy === 0) return 0;
  let best = 0, bv = -Infinity;
  for (let d = 0; d < 360; d += 6) { const v = dx * COS[d] + dy * SIN[d]; if (v > bv) { bv = v; best = d; } }
  const b0 = best;
  for (let d = b0 - 5; d <= b0 + 5; d++) {
    const dd = wnorm(d); const v = dx * COS[dd] + dy * SIN[dd];
    if (v > bv) { bv = v; best = dd; }
  }
  return best;
}

export function abstand(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.floor(Math.sqrt(dx * dx + dy * dy)); }
export function abstand2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function kachel(x, y) { return Math.floor(y / 1000) * KARTE_B + Math.floor(x / 1000); }
export function kachelMitte(k) { return { x: (k % KARTE_B) * 1000 + 500, y: Math.floor(k / KARTE_B) * 1000 + 500 }; }

/** Ecken eines gedrehten Rechtecks {x,y,b,t,w}: [x0,y0, x1,y1, x2,y2, x3,y3]. */
export function ecken(o) {
  const c = COS[o.w], s = SIN[o.w], hb = o.b / 2, ht = o.t / 2;
  const ux = Math.trunc(c * hb / 1024), uy = Math.trunc(s * hb / 1024);
  const vx = Math.trunc(-s * ht / 1024), vy = Math.trunc(c * ht / 1024);
  return [o.x - ux - vx, o.y - uy - vy, o.x + ux - vx, o.y + uy - vy, o.x + ux + vx, o.y + uy + vy, o.x - ux + vx, o.y - uy + vy];
}

/** Lokale Koordinaten (lu entlang b, lv entlang t) → Welt. */
export function lokal(o, lu, lv) {
  const c = COS[o.w], s = SIN[o.w];
  return { x: o.x + Math.trunc((c * lu - s * lv) / 1024), y: o.y + Math.trunc((s * lu + c * lv) / 1024) };
}

export function punktIn(o, px, py, rand = 0) {
  const c = COS[o.w], s = SIN[o.w], dx = px - o.x, dy = py - o.y;
  const lu = dx * c + dy * s, lv = -dx * s + dy * c;
  return Math.abs(lu) <= (o.b / 2 + rand) * 1024 && Math.abs(lv) <= (o.t / 2 + rand) * 1024;
}

/** Überlappen zwei gedrehte Rechtecke (mit Mindestabstand rand)? Trennachsen-Test, ganzzahlig. */
export function ueberlappt(a, b, rand) {
  const ea = ecken(a), eb = ecken(b);
  const ax = [COS[a.w], SIN[a.w], -SIN[a.w], COS[a.w], COS[b.w], SIN[b.w], -SIN[b.w], COS[b.w]];
  for (let k = 0; k < 8; k += 2) {
    const vx = ax[k], vy = ax[k + 1];
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      const pa = ea[i] * vx + ea[i + 1] * vy; if (pa < amin) amin = pa; if (pa > amax) amax = pa;
      const pb = eb[i] * vx + eb[i + 1] * vy; if (pb < bmin) bmin = pb; if (pb > bmax) bmax = pb;
    }
    if (amax + rand * 1024 < bmin || bmax + rand * 1024 < amin) return false;
  }
  return true;
}

/** Abstand Punkt–Strecke (Milli). */
export function abstandStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const qx = ax + Math.trunc(dx * t), qy = ay + Math.trunc(dy * t);
  return abstand(px, py, qx, qy);
}

/** Ereignis für die Darstellung (Pfeile, Meldungen …). Bleibt nur kurz im Zustand. */
export function ereignis(z, e) {
  z.ereignisNr++;
  e.nr = z.ereignisNr; e.tick = z.tick;
  z.ereignisse.push(e);
  if (z.ereignisse.length > 120) z.ereignisse.splice(0, z.ereignisse.length - 120);
}

/** Meldung an einen Herrn, mit Sperre gegen Wiederholung (schluessel, sperrTicks). */
export function meldung(z, herr, text, art = 'info', schluessel = null, sperre = 1800) {
  const h = z.herren[herr];
  if (schluessel) {
    const letzt = h.meldeSperre[schluessel];
    if (letzt !== undefined && z.tick - letzt < sperre) return;
    h.meldeSperre[schluessel] = z.tick;
  }
  ereignis(z, { typ: 'meldung', herr, text, art });
}

export function datum(tick) {
  const tag = Math.floor(tick / 600);
  return { tag, jahreszeit: Math.floor(tag / 5) % 4, jahr: Math.floor(tag / 20) + 1, tagInZeit: tag % 5 };
}
