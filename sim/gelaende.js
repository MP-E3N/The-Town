/**
 * gelaende.js — Das Gelände als stetige Funktionen (Höhe, Fruchtbarkeit, Wald, Fels, Erz).
 *
 * ZWECK:    Eine Quelle für Simulation (Kachelmitten) und Darstellung (beliebig fein → scharfe Ufer).
 * REGEL:    Nur +, −, ×, ÷, floor, abs, min, max, sqrt → in jedem Browser bitgleich.
 *           Kein exp/sin/pow (die dürfen sich zwischen Engines unterscheiden).
 *           Koordinaten in Kacheln (Kommazahlen erlaubt).
 */

import { hash32 } from './lib.js';
import { KARTE_B, KARTE_H } from '../data/werte.js';

const cache = new Map();
export function gelaendeFuer(seed) {
  if (!cache.has(seed)) cache.set(seed, erzeuge(seed));
  return cache.get(seed);
}

function erzeuge(seed) {
  const B = KARTE_B, H = KARTE_H;
  const zuf = (a, b, s) => hash32(a | 0, b | 0, (seed * 7919 + s) | 0) / 4294967296;
  function rausch(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = zuf(ix, iy, s), b = zuf(ix + 1, iy, s), c = zuf(ix, iy + 1, s), d = zuf(ix + 1, iy + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(x, y, s, okt) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < okt; o++) { sum += rausch(x * f, y * f, s + o * 17) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  const flussX0 = B * (0.40 + 0.14 * zuf(1, 1, 1));
  const flussX = (y) => flussX0 + (rausch(y / 26, 0.5, 11) - 0.5) * 30 + (rausch(y / 9, 7.5, 12) - 0.5) * 7;
  const flussBreite = (y) => 1.05 + rausch(y / 15, 3.3, 13) * 0.7;

  const yb = Math.floor(H * (0.42 + 0.14 * zuf(2, 2, 2)));
  const seite = flussX(yb) > B / 2 ? -1 : 1;
  const burg = { x: flussX(yb) + seite * (12 + 3 * zuf(3, 3, 3)), y: yb + 0.5 };
  const markt = { x: flussX(yb + 5) + seite * 7, y: yb + 5.5 };
  const oben = zuf(4, 4, 4) < 0.5 ? -1 : 1;
  const klemm = (v, a, b) => Math.max(a, Math.min(b, v));
  const erzOrt = { x: klemm(burg.x + seite * (7 + 6 * zuf(5, 5, 5)), 8, B - 8), y: klemm(burg.y + oben * (15 + 5 * zuf(6, 6, 6)), 8, H - 8) };
  const steinOrt = { x: klemm(burg.x + seite * (13 + 5 * zuf(7, 7, 7)), 8, B - 8), y: klemm(burg.y - oben * (11 + 6 * zuf(8, 8, 8)), 8, H - 8) };

  /** Glockenförmiger Hügel ohne exp: (1−q)² innerhalb von r. */
  function huegel(x, y, o, r, amp) {
    const dx = x - o.x, dy = y - o.y, q = (dx * dx + dy * dy) / (r * r);
    if (q >= 1) return 0;
    const t = 1 - q; return amp * t * t;
  }

  function roh(x, y) { return fbm(x / 30, y / 30, 100, 4); }

  /** Höhe 0..1, Wasser unter 0,30. */
  function hoehe(x, y) {
    let h = 0.34 + roh(x, y) * 0.52;
    const d = Math.abs(x - flussX(y));
    const tal = Math.max(0, 1 - d / 20);
    h -= tal * tal * 0.16;
    h += huegel(x, y, burg, 7.5, 0.24);
    h += huegel(x, y, erzOrt, 7.5, 0.17) + huegel(x, y, steinOrt, 7, 0.16);
    const dm2 = ((x - markt.x) * (x - markt.x) + (y - markt.y) * (y - markt.y)) / 144;
    if (dm2 < 1) { const t = Math.min(1, (1 - dm2) * 1.6) * 0.92; h = h * (1 - t) + 0.40 * t; }
    const hw = flussBreite(y);
    if (d < hw) {
      const t = d / hw; h = Math.min(h, 0.22 + 0.07 * t * t);
    } else if (d < hw + 5) {
      const t = (d - hw) / 5, ufer = 0.308 + t * 0.03;
      if (h > ufer) h = ufer + (h - ufer) * t * t;
    }
    return Math.max(0, Math.min(1, h));
  }

  function feucht(x, y) { return fbm(x / 22 + 50, y / 22, 200, 3); }

  function fruchtbar(x, y) {
    const h = hoehe(x, y), d = Math.abs(x - flussX(y));
    const f = feucht(x, y) * 0.65 + Math.max(0, 1 - d / 26) * 0.35 + 0.08 - Math.max(0, h - 0.6) * 1.5 + (rausch(x / 6, y / 6, 400) - 0.5) * 0.25;
    return Math.max(0, Math.min(1, f));
  }

  function wald(x, y) {
    const n = fbm(x / 13 + 9, y / 13 + 3, 300, 3);
    let w = (n - 0.52) * 3.6 + (feucht(x, y) - 0.5) * 0.8;
    const dm = Math.sqrt((x - markt.x) * (x - markt.x) + (y - markt.y) * (y - markt.y));
    const db = Math.sqrt((x - burg.x) * (x - burg.x) + (y - burg.y) * (y - burg.y));
    if (dm < 11) w -= (11 - dm) / 4;
    if (db < 8) w -= (8 - db) / 3;
    if (Math.abs(x - flussX(y)) < flussBreite(y) + 2) w -= 1;
    return Math.max(0, Math.min(1, w));
  }

  function fels(x, y) {
    const h = hoehe(x, y);
    const a = huegel(x, y, steinOrt, 4.5, 1) * 1.6 + Math.max(0, h - 0.78) * 4;
    return Math.max(0, Math.min(1, a + (rausch(x / 3, y / 3, 500) - 0.5) * 0.4 * (a > 0.1 ? 1 : 0)));
  }

  function erz(x, y) {
    const a = huegel(x, y, erzOrt, 3.8, 1) * 1.5;
    return Math.max(0, Math.min(1, a + (rausch(x / 2.5, y / 2.5, 600) - 0.5) * 0.5 * (a > 0.1 ? 1 : 0)));
  }

  /** Nadelbaum-Anteil (für die Darstellung, höhere Lagen = mehr Nadelwald). */
  function nadel(x, y) { return Math.max(0, Math.min(1, (hoehe(x, y) - 0.5) * 3 + (rausch(x / 9, y / 9, 700) - 0.5) * 1.2)); }

  /** Feine Flecken für die Grasfarbe (nur Darstellung). */
  function flecken(x, y) { return fbm(x / 4, y / 4, 800, 2); }

  return { B, H, seite, burg, markt, erzOrt, steinOrt, flussX, flussBreite, hoehe, fruchtbar, wald, fels, erz, nadel, flecken, feucht };
}
