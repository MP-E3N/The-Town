/**
 * karte.js — Das feste Kachel-Raster aus dem Gelände (ändert sich nie im Spiel).
 *
 * ZWECK:    Höhe, Wasser, Hang, Fruchtbarkeit, Start-Wald, Fels, Erz pro Kachel (128×96).
 * LIEST:    sim/gelaende.js
 * REGEL:    Alles ganzzahlig gespeichert. Veränderliches (Wald, Zonen) liegt im Zustand.
 */

import { gelaendeFuer } from './gelaende.js';
import { KARTE_B, KARTE_H, WASSERSPIEGEL } from '../data/werte.js';

const cache = new Map();
export function karteFuer(seed) {
  if (!cache.has(seed)) cache.set(seed, erzeuge(seed));
  return cache.get(seed);
}

function erzeuge(seed) {
  const g = gelaendeFuer(seed);
  const B = KARTE_B, H = KARTE_H, N = B * H;
  const hoehe = new Int16Array(N), wasser = new Uint8Array(N), steil = new Uint8Array(N);
  const frucht = new Uint8Array(N), waldStart = new Uint8Array(N), fels = new Uint8Array(N), erz = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const i = y * B + x, fx = x + 0.5, fy = y + 0.5;
    const h = Math.floor(g.hoehe(fx, fy) * 1000);
    hoehe[i] = h;
    wasser[i] = h < WASSERSPIEGEL ? 1 : 0;
    frucht[i] = Math.floor(g.fruchtbar(fx, fy) * 100);
    fels[i] = Math.floor(g.fels(fx, fy) * 100);
    erz[i] = Math.floor(g.erz(fx, fy) * 100);
    const w = g.wald(fx, fy);
    waldStart[i] = (wasser[i] || fels[i] > 40 || erz[i] > 40) ? 0 : (w > 0.75 ? 100 : w > 0.5 ? 75 : w > 0.3 ? 50 : w > 0.15 ? 25 : 0);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const i = y * B + x; let m = 0;
    if (x > 0) m = Math.max(m, Math.abs(hoehe[i] - hoehe[i - 1]));
    if (x < B - 1) m = Math.max(m, Math.abs(hoehe[i] - hoehe[i + 1]));
    if (y > 0) m = Math.max(m, Math.abs(hoehe[i] - hoehe[i - B]));
    if (y < H - 1) m = Math.max(m, Math.abs(hoehe[i] - hoehe[i + B]));
    steil[i] = Math.min(255, m);
  }
  const milli = (p) => ({ x: Math.floor(p.x * 1000), y: Math.floor(p.y * 1000) });
  return {
    seed, B, H, g, hoehe, wasser, steil, frucht, waldStart, fels, erz,
    burg: milli(g.burg), markt: milli(g.markt), erzOrt: milli(g.erzOrt), steinOrt: milli(g.steinOrt),
  };
}
