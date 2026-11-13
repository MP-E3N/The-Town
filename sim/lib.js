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

/**
 * Ecken eines gedrehten Rechtecks {x,y,b,t,w}: [x0,y0, x1,y1, x2,y2, x3,y3].
 * Hat das Objekt ein konvexes Viereck `poly` (Trapezfeld), sind das seine Ecken — alle Kollisionsprüfungen
 * (ueberlappt, punktIn, Raster) arbeiten dann mit dem Viereck statt mit dem Kernrechteck.
 */
export function ecken(o) {
  if (o.poly) return o.poly;
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

/**
 * Trennachsen (Länge 1024) eines Objekts: beim Rechteck seine zwei Achsen, beim Viereck die Normalen der vier Kanten.
 * WARUM Math.sqrt erlaubt: Die Wurzel ist in IEEE-754 exakt gerundet, also in allen Browsern bitgleich.
 */
function achsen(o, e) {
  if (!o.poly) return [COS[o.w], SIN[o.w], -SIN[o.w], COS[o.w]];
  const out = [];
  for (let i = 0; i < 8; i += 2) {
    const j = (i + 2) % 8, dx = e[j] - e[i], dy = e[j + 1] - e[i + 1], l = Math.sqrt(dx * dx + dy * dy) || 1;
    out.push(Math.trunc(-dy * 1024 / l), Math.trunc(dx * 1024 / l));
  }
  return out;
}

export function punktIn(o, px, py, rand = 0) {
  if (o.poly) {
    // Konvexes Viereck: auf jeder Kantennormale muss der Punkt im Schatten des Vierecks (± rand) liegen.
    const e = o.poly, ax = achsen(o, e);
    for (let k = 0; k < ax.length; k += 2) {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < 8; i += 2) { const p = e[i] * ax[k] + e[i + 1] * ax[k + 1]; if (p < mn) mn = p; if (p > mx) mx = p; }
      const q = px * ax[k] + py * ax[k + 1];
      if (q < mn - rand * 1024 || q > mx + rand * 1024) return false;
    }
    return true;
  }
  const c = COS[o.w], s = SIN[o.w], dx = px - o.x, dy = py - o.y;
  const lu = dx * c + dy * s, lv = -dx * s + dy * c;
  return Math.abs(lu) <= (o.b / 2 + rand) * 1024 && Math.abs(lv) <= (o.t / 2 + rand) * 1024;
}

/** Fläche (Milli-Kacheln²) eines Objekts: Rechteck b×t oder Viereck nach der Gaußschen Trapezformel. */
export function flaecheVon(o) {
  if (!o.poly) return o.b * o.t;
  const e = o.poly;
  let a = 0;
  for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8; a += e[i] * e[j + 1] - e[j] * e[i + 1]; }
  return Math.abs(Math.trunc(a / 2));
}

/** Größter Abstand von der Mitte (x,y) zu einer Ecke — für Suchradien. */
export function radiusVon(o) {
  if (!o.poly) return Math.max(o.b, o.t);
  let r = 0;
  for (let i = 0; i < 8; i += 2) r = Math.max(r, abstand(o.x, o.y, o.poly[i], o.poly[i + 1]));
  return r;
}

/** Überlappen zwei gedrehte Rechtecke/Vierecke (mit Mindestabstand rand)? Trennachsen-Test, ganzzahlig. */
export function ueberlappt(a, b, rand) {
  const ea = ecken(a), eb = ecken(b);
  const ax = achsen(a, ea).concat(achsen(b, eb));
  for (let k = 0; k < ax.length; k += 2) {
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

/** Rundung einer Straßenecke: 0 = eckig, 1 = rund (Standard), 2 = stark rund. */
export const ECKE_NAME = ['eckig', 'rund', 'stark rund'];
export function eckeRund(s, i) { return s.rund && s.rund[i] !== undefined && s.rund[i] !== null ? s.rund[i] : 1; }

/**
 * Linienzug einer Straße mit gerundeten Ecken (flach, Milli-Kacheln). Simulation (Raster, Kollision, Tore) und
 * Darstellung benutzen DIESELBE Linie — so liegt das Bild genau auf dem, womit gerechnet wird.
 * Jede innere Ecke wird durch einen quadratischen Bogen ersetzt, der d vor der Ecke beginnt und d dahinter endet:
 * rund = 35 % der kürzeren Nachbarstrecke (höchstens 3,5 Kacheln), stark = 49 % (höchstens 9 Kacheln).
 * WARUM höchstens 49 %: Zwei Nachbarecken teilen sich die Strecke dazwischen, ihre Bögen dürfen sich nicht kreuzen.
 * Fast gerade Ecken (< 5°) und eckige (0) bleiben, wie sie sind. Ganzzahlig, deterministisch.
 */
export function strassenLinie(s) {
  const p = s.punkte, n = p.length / 2;
  if (n < 3) return p;
  const out = [p[0], p[1]];
  for (let i = 1; i < n - 1; i++) {
    const px = p[2 * i], py = p[2 * i + 1], ax = p[2 * i - 2], ay = p[2 * i - 1], bx = p[2 * i + 2], by = p[2 * i + 3];
    const r = eckeRund(s, i), la = abstand(px, py, ax, ay), lb = abstand(px, py, bx, by);
    const dot = (px - ax) * (bx - px) + (py - ay) * (by - py);
    if (r === 0 || la < 200 || lb < 200 || dot * 1000 > 996 * la * lb) { out.push(px, py); continue; }
    const d = Math.min(Math.trunc(Math.min(la, lb) * (r === 2 ? 49 : 35) / 100), r === 2 ? 9000 : 3500);
    const x1 = px + Math.trunc((ax - px) * d / la), y1 = py + Math.trunc((ay - py) * d / la);
    const x2 = px + Math.trunc((bx - px) * d / lb), y2 = py + Math.trunc((by - py) * d / lb);
    const T = Math.max(2, Math.min(12, Math.ceil(d / 350))), T2 = T * T;
    for (let k = 0; k <= T; k++) {
      const a = (T - k) * (T - k), m = 2 * (T - k) * k, c = k * k;
      out.push(Math.trunc((a * x1 + m * px + c * x2) / T2), Math.trunc((a * y1 + m * py + c * y2) / T2));
    }
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
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
