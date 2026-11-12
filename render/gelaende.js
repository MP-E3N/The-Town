/**
 * gelaende.js (render) — Gelände als Bild: Grundbild der ganzen Karte + scharfe Chunks beim Nahzoom.
 *
 * ZWECK:    Schnelles Zeichnen: Pixelfarben werden einmal berechnet und als Canvas zwischengespeichert.
 * LIEST:    sim/gelaende.js (stetige Funktionen) — darum scharfe Ufer in jeder Zoomstufe.
 * REGEL:    Nur Darstellung; darf Math.random/sin benutzen. Chunks: 8×8 Kacheln, LRU-Cache je Stufe.
 *           Farbe wird auf einem Gitter (4 Punkte je Kachel) vorberechnet und pro Pixel bilinear
 *           gemischt; Wasserlinie und Ufer werden pro Pixel aus der Höhe bestimmt.
 */

import { gelaendeFuer } from '../sim/gelaende.js';
import { KARTE_B, KARTE_H } from '../data/werte.js';

const R = 4; // Gitterpunkte je Kachel
const W = 0.30; // Wasserspiegel (0..1)
const CHUNK = 8;
const STUFEN = [{ ppt: 24, max: 260 }, { ppt: 64, max: 70 }];

function mische(a, b, t) { return a + (b - a) * t; }

export function erzeugeGelaende(seed) {
  const g = gelaendeFuer(seed);
  const GW = KARTE_B * R + 2, GH = KARTE_H * R + 2;
  const hoehe = new Float32Array(GW * GH);
  const farbe = new Float32Array(GW * GH * 3);
  const schatten = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i / R, y = j / R;
    hoehe[j * GW + i] = g.hoehe(x, y);
  }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i / R, y = j / R, k = j * GW + i;
    const h = hoehe[k];
    const fr = g.fruchtbar(x, y), fe = g.fels(x, y), er = g.erz(x, y), fl = g.flecken(x, y), fu = g.feucht(x, y);
    // Gras: trocken ↔ saftig, Flecken
    let r = mische(158, 78, fr), gg = mische(160, 128, fr), b = mische(84, 52, fr);
    const f2 = (fl - 0.5) * 0.35;
    r *= 1 + f2 * 0.6; gg *= 1 + f2 * 0.4; b *= 1 + f2 * 0.3;
    // Höhenlage: etwas olivgrauer
    const hl = Math.max(0, h - 0.62) * 2.2;
    r = mische(r, 128, Math.min(1, hl)); gg = mische(gg, 128, Math.min(1, hl)); b = mische(b, 104, Math.min(1, hl));
    // feuchte Senken dunkler
    if (fu > 0.62) { const t = Math.min(1, (fu - 0.62) * 3); r = mische(r, 70, t * 0.3); gg = mische(gg, 100, t * 0.3); b = mische(b, 60, t * 0.3); }
    // Fels
    if (fe > 0.25) { const t = Math.min(1, (fe - 0.25) * 2); r = mische(r, 140, t); gg = mische(gg, 136, t); b = mische(b, 126, t); }
    // Erz: rostig
    if (er > 0.25) { const t = Math.min(1, (er - 0.25) * 2); r = mische(r, 150, t); gg = mische(gg, 98, t); b = mische(b, 72, t); }
    farbe[k * 3] = r; farbe[k * 3 + 1] = gg; farbe[k * 3 + 2] = b;
    // Hangschattierung (Licht von Nordwest)
    const hx = hoehe[j * GW + Math.min(GW - 1, i + 1)] - hoehe[j * GW + Math.max(0, i - 1)];
    const hy = hoehe[Math.min(GH - 1, j + 1) * GW + i] - hoehe[Math.max(0, j - 1) * GW + i];
    schatten[k] = Math.max(0.68, Math.min(1.3, 1 - (hx + hy) * 9));
    farbe[k * 3] *= schatten[k]; farbe[k * 3 + 1] *= schatten[k]; farbe[k * 3 + 2] *= schatten[k];
  }
  // Körnung (weltfest)
  const korn = new Float32Array(64 * 64);
  for (let i = 0; i < korn.length; i++) korn[i] = (Math.random() - 0.5) * 0.09;

  const gr = { seed, g, GW, GH, hoehe, farbe, schatten, korn, chunks: [new Map(), new Map()], basis: null, zeit: 0 };
  gr.basis = zeichneBereich(gr, 0, 0, KARTE_B, KARTE_H, 8);
  return gr;
}

/** Zeichnet einen Kachelbereich mit ppt Pixeln pro Kachel in ein neues Canvas. */
function zeichneBereich(gr, tx0, ty0, tw, th, ppt) {
  const cw = tw * ppt, ch = th * ppt;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cw, ch);
  const d32 = new Uint32Array(img.data.buffer);
  const { GW, GH, hoehe, farbe, korn } = gr;
  const s = R / ppt;
  for (let py = 0; py < ch; py++) {
    const gy = (ty0 * ppt + py + 0.5) * s;
    const j0 = Math.min(GH - 2, Math.floor(gy)), fy = gy - j0;
    for (let px = 0; px < cw; px++) {
      const gx = (tx0 * ppt + px + 0.5) * s;
      const i0 = Math.min(GW - 2, Math.floor(gx)), fx = gx - i0;
      const k00 = j0 * GW + i0, k10 = k00 + 1, k01 = k00 + GW, k11 = k01 + 1;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const h = hoehe[k00] * w00 + hoehe[k10] * w10 + hoehe[k01] * w01 + hoehe[k11] * w11;
      const kn = korn[(((tx0 * ppt + px) & 63) + (((ty0 * ppt + py) & 63) << 6))];
      let r, g, b;
      if (h < W) {
        const t = Math.min(1, (W - h) / 0.07);
        r = mische(92, 34, t); g = mische(140, 78, t); b = mische(142, 118, t);
        if (h > W - 0.006) { const u = (h - (W - 0.006)) / 0.006; r = mische(r, 170, u * 0.7); g = mische(g, 190, u * 0.7); b = mische(b, 180, u * 0.7); }
        const k = 1 + kn * 0.4;
        r *= k; g *= k; b *= k;
      } else {
        r = farbe[k00 * 3] * w00 + farbe[k10 * 3] * w10 + farbe[k01 * 3] * w01 + farbe[k11 * 3] * w11;
        g = farbe[k00 * 3 + 1] * w00 + farbe[k10 * 3 + 1] * w10 + farbe[k01 * 3 + 1] * w01 + farbe[k11 * 3 + 1] * w11;
        b = farbe[k00 * 3 + 2] * w00 + farbe[k10 * 3 + 2] * w10 + farbe[k01 * 3 + 2] * w01 + farbe[k11 * 3 + 2] * w11;
        if (h < W + 0.014) { const u = 1 - (h - W) / 0.014; r = mische(r, 182, u); g = mische(g, 168, u); b = mische(b, 120, u); }
        const k = 1 + kn;
        r *= k; g *= k; b *= k;
      }
      const ri = r < 0 ? 0 : r > 255 ? 255 : r | 0, gi = g < 0 ? 0 : g > 255 ? 255 : g | 0, bi = b < 0 ? 0 : b > 255 ? 255 : b | 0;
      d32[py * cw + px] = 0xff000000 | (bi << 16) | (gi << 8) | ri;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Zeichnet das Gelände für die Kamera. budget = wie viele neue Chunks dieses Bild höchstens. */
export function zeichneGelaende(ctx, gr, kam, budget = 1) {
  const z = kam.zoom;
  ctx.imageSmoothingEnabled = true;
  // Grundbild immer (deckt Lücken, solange Chunks fehlen)
  const ox = kam.b / 2 - kam.x * z, oy = kam.h / 2 - kam.y * z;
  ctx.drawImage(gr.basis, ox, oy, KARTE_B * z, KARTE_H * z);
  if (z < 14) return;
  const stufe = z < 40 ? 0 : 1;
  const st = STUFEN[stufe], cache = gr.chunks[stufe];
  const x0 = Math.max(0, Math.floor((kam.x - kam.b / 2 / z) / CHUNK)), x1 = Math.min(KARTE_B / CHUNK - 1, Math.floor((kam.x + kam.b / 2 / z) / CHUNK));
  const y0 = Math.max(0, Math.floor((kam.y - kam.h / 2 / z) / CHUNK)), y1 = Math.min(KARTE_H / CHUNK - 1, Math.floor((kam.y + kam.h / 2 / z) / CHUNK));
  gr.zeit++;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const key = cy * 100 + cx;
    let c = cache.get(key);
    if (!c && budget > 0) {
      budget--;
      c = { cv: zeichneBereich(gr, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, st.ppt), t: 0 };
      cache.set(key, c);
      if (cache.size > st.max) {
        let alt = null, at = Infinity;
        for (const [k, v] of cache) if (v.t < at) { at = v.t; alt = k; }
        cache.delete(alt);
      }
    }
    if (!c) {
      // Feinere Stufe fehlt noch → gröbere Stufe benutzen, falls da
      const grob = stufe > 0 ? gr.chunks[0].get(key) : null;
      if (grob) ctx.drawImage(grob.cv, Math.floor(ox + cx * CHUNK * z), Math.floor(oy + cy * CHUNK * z), Math.ceil(CHUNK * z) + 1, Math.ceil(CHUNK * z) + 1);
      continue;
    }
    c.t = gr.zeit;
    ctx.drawImage(c.cv, Math.floor(ox + cx * CHUNK * z), Math.floor(oy + cy * CHUNK * z), Math.ceil(CHUNK * z) + 1, Math.ceil(CHUNK * z) + 1);
  }
}

/** Höhe an einer Weltstelle (Kacheln), aus dem Gitter. */
export function hoeheBei(gr, x, y) {
  const i = Math.max(0, Math.min(gr.GW - 1, Math.round(x * R))), j = Math.max(0, Math.min(gr.GH - 1, Math.round(y * R)));
  return gr.hoehe[j * gr.GW + i];
}

/** Grob-Chunks (24 px/Kachel) im Leerlauf vorberechnen, nahe der Mitte zuerst → kein Ruckeln beim Zoomen. */
export function vorrendern(gr, mx, my) {
  const st = STUFEN[0], cache = gr.chunks[0];
  const liste = [];
  for (let cy = 0; cy < KARTE_H / CHUNK; cy++) for (let cx = 0; cx < KARTE_B / CHUNK; cx++) liste.push([cx, cy, (cx * CHUNK - mx) ** 2 + (cy * CHUNK - my) ** 2]);
  liste.sort((a, b) => a[2] - b[2]);
  let i = 0;
  const schritt = () => {
    const ende = performance.now() + 6;
    while (i < liste.length && performance.now() < ende) {
      const [cx, cy] = liste[i++];
      const key = cy * 100 + cx;
      if (!cache.has(key)) cache.set(key, { cv: zeichneBereich(gr, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, st.ppt), t: 0 });
    }
    if (i < liste.length) setTimeout(schritt, 30);
  };
  setTimeout(schritt, 300);
}
