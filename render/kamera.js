/**
 * kamera.js — Kamera in Kachel-Einheiten, mit weichem Zoom und weichem Schwenken.
 *
 * ZWECK:    Bildschirm ↔ Welt, Zoomen zum Mauszeiger (gleitend), WASD mit Beschleunigung, Flug zu einem Ziel.
 * SCHREIBT: nur das Kamera-Objekt
 * REGEL:    x/y = Mittelpunkt in Kacheln, zoom = Pixel pro Kachel (CSS-Pixel).
 *           Weich = exponentielles Annähern je Bild (unabhängig von der Bildrate).
 */

import { KARTE_B, KARTE_H } from '../data/werte.js';

export const ZOOM_MIN = 6;
export const ZOOM_MAX = 128;

export function neueKamera() {
  return { x: 64, y: 48, zoom: 30, b: 800, h: 600, zielZoom: 30, anker: null, vx: 0, vy: 0, flug: null };
}

export function zuWelt(k, sx, sy) { return { x: (sx - k.b / 2) / k.zoom + k.x, y: (sy - k.h / 2) / k.zoom + k.y }; }
export function zuSchirm(k, wx, wy) { return { x: (wx - k.x) * k.zoom + k.b / 2, y: (wy - k.y) * k.zoom + k.h / 2 }; }

/** Setzt ein neues Zoom-Ziel; der Weltpunkt unter dem Mauszeiger bleibt dabei stehen. */
export function zoomeUm(k, faktor, sx, sy) {
  if (!k.anker) k.zielZoom = k.zoom;
  k.zielZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k.zielZoom * faktor));
  const w = zuWelt(k, sx, sy);
  k.anker = { sx, sy, wx: w.x, wy: w.y };
  k.flug = null;
}

/** Sofort setzen (z. B. Debug, Start) — beendet laufende Animationen. */
export function setzeZoom(k, z) { k.zoom = k.zielZoom = z; k.anker = null; }

/** Gleitet zu einem Weltpunkt (Taste H, Klick auf Meldung …). */
export function fliegeZu(k, x, y) { k.flug = { x, y }; }

/**
 * Ein Bild weiter: Zoom gleitet, WASD beschleunigt/bremst weich, Flug nähert sich.
 * richtung = {x,y} aus den gedrückten Tasten (−1..1).
 */
export function kameraSchritt(k, dt, richtung) {
  if (k.anker) {
    const f = 1 - Math.exp(-dt * 14);
    const lz = Math.log(k.zoom) + (Math.log(k.zielZoom) - Math.log(k.zoom)) * f;
    k.zoom = Math.exp(lz);
    if (Math.abs(k.zoom - k.zielZoom) < 0.01) k.zoom = k.zielZoom;
    // Anker festhalten: derselbe Weltpunkt bleibt unter derselben Bildschirmstelle
    k.x = k.anker.wx - (k.anker.sx - k.b / 2) / k.zoom;
    k.y = k.anker.wy - (k.anker.sy - k.h / 2) / k.zoom;
    if (k.zoom === k.zielZoom) k.anker = null;
  }
  // WASD: Zielgeschwindigkeit in Bildschirm-Pixeln/s, weich angenähert
  const tempo = 700 / k.zoom;
  const g = 1 - Math.exp(-dt * (richtung.x || richtung.y ? 10 : 7));
  k.vx += (richtung.x * tempo - k.vx) * g;
  k.vy += (richtung.y * tempo - k.vy) * g;
  if (Math.abs(k.vx) + Math.abs(k.vy) > 0.001) { k.x += k.vx * dt; k.y += k.vy * dt; k.flug = null; if (k.anker) { k.anker.wx += k.vx * dt; k.anker.wy += k.vy * dt; } }
  if (k.flug) {
    const f = 1 - Math.exp(-dt * 5);
    k.x += (k.flug.x - k.x) * f; k.y += (k.flug.y - k.y) * f;
    if (Math.abs(k.flug.x - k.x) + Math.abs(k.flug.y - k.y) < 0.02) k.flug = null;
  }
  begrenze(k);
}

export function begrenze(k) {
  k.x = Math.min(KARTE_B, Math.max(0, k.x));
  k.y = Math.min(KARTE_H, Math.max(0, k.y));
}

/** Sichtbarer Weltausschnitt (Kacheln) mit Rand. */
export function sicht(k, rand = 1) {
  return { x0: k.x - k.b / 2 / k.zoom - rand, y0: k.y - k.h / 2 / k.zoom - rand, x1: k.x + k.b / 2 / k.zoom + rand, y1: k.y + k.h / 2 / k.zoom + rand };
}
