/**
 * kamera.js — Kamera in Kachel-Einheiten.
 *
 * ZWECK:    Bildschirm ↔ Welt, Zoomen zum Mauszeiger, Begrenzung.
 * SCHREIBT: nur das Kamera-Objekt
 * REGEL:    x/y = Mittelpunkt in Kacheln, zoom = Pixel pro Kachel (CSS-Pixel).
 */

import { KARTE_B, KARTE_H } from '../data/werte.js';

export const ZOOM_MIN = 6;
export const ZOOM_MAX = 128;

export function neueKamera() { return { x: 64, y: 48, zoom: 30, b: 800, h: 600 }; }

export function zuWelt(k, sx, sy) { return { x: (sx - k.b / 2) / k.zoom + k.x, y: (sy - k.h / 2) / k.zoom + k.y }; }
export function zuSchirm(k, wx, wy) { return { x: (wx - k.x) * k.zoom + k.b / 2, y: (wy - k.y) * k.zoom + k.h / 2 }; }

export function zoomeUm(k, faktor, sx, sy) {
  const vor = zuWelt(k, sx, sy);
  k.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k.zoom * faktor));
  const nach = zuWelt(k, sx, sy);
  k.x += vor.x - nach.x; k.y += vor.y - nach.y;
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
