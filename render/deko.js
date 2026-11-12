/**
 * deko.js — Bäume (mit Schatten) und Gras/Blumen als vorgezeichnete Kacheln.
 *
 * ZWECK:    Performance. Statt tausende Bäume pro Bild einzeln zu zeichnen, werden sie je Chunk
 *           (8×8 Kacheln) einmal in ein Canvas gemalt und nur neu gemalt, wenn sich dort etwas ändert
 *           (Baum gefällt/nachgewachsen, Straße/Gebäude/Feld, Jahreszeit). Fernsicht: eine Karte für alles.
 * LIEST:    z.wald, abgeleitete Raster (Straße/Belegt/Feld), Sprites
 * REGEL:    Nur Darstellung. Chunks haben 1 Kachel Rand, damit Kronen über die Chunkgrenze ragen dürfen.
 */

import { KARTE_B, KARTE_H } from '../data/werte.js';
import { hash32 } from '../sim/lib.js';
import { baeume } from './sprites.js';

const CHUNK = 8, RAND = 1;
const STUFEN = [{ ppt: 24, max: 220, gras: false }, { ppt: 56, max: 90, gras: true }];

export function erzeugeDeko() {
  return { chunks: [new Map(), new Map()], zeit: 0, fern: null, fernSig: -1, fernPruef: 0 };
}

function signatur(z, c, nadel, cx, cy, saison) {
  let s = saison * 7919;
  for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK; ty++) for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK; tx++) {
    const i = ty * KARTE_B + tx;
    s = (s * 31 + z.wald[i] + (c.strasse[i] ? 1000 : 0) + (c.belegt[i] ? 2000 : 0) + (c.feld[i] ? 4000 : 0)) | 0;
  }
  void nadel;
  return s;
}

/** Bäume einer Kachel als Liste [x, y, größe, hash]. */
function baumeVon(z, c, tx, ty, nurGrosse) {
  const i = ty * KARTE_B + tx, wv = z.wald[i];
  if (wv <= 0 || c.strasse[i] || c.belegt[i] || c.feld[i]) return [];
  const n = nurGrosse ? (wv >= 50 ? 1 : 0) : Math.ceil(wv / 25);
  const out = [];
  for (let j = 0; j < n; j++) {
    const hh = hash32(tx, ty, j);
    const x = tx + 0.2 + ((hh & 255) / 255) * 0.6, y = ty + 0.2 + (((hh >>> 8) & 255) / 255) * 0.6;
    const gross = nurGrosse ? 1.5 : (0.75 + ((hh >>> 16) & 255) / 255 * 0.5) * (wv < 25 ? 0.5 : 1);
    out.push([x, y, gross, hh]);
  }
  return out;
}

function zeichneChunk(z, c, k, nadel, cx, cy, saison, st) {
  const ppt = st.ppt, groesse = (CHUNK + 2 * RAND) * ppt;
  const cv = document.createElement('canvas');
  cv.width = groesse; cv.height = groesse;
  const ctx = cv.getContext('2d');
  const ox = cx * CHUNK - RAND, oy = cy * CHUNK - RAND;
  ctx.setTransform(ppt, 0, 0, ppt, -ox * ppt, -oy * ppt);
  if (st.gras) {
    const gras = new Path2D(), blume = [new Path2D(), new Path2D(), new Path2D()], stein = new Path2D();
    for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK; ty++) for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK; tx++) {
      const i = ty * KARTE_B + tx;
      if (k.wasser[i] || c.strasse[i] || c.belegt[i] || c.feld[i] || z.wald[i] >= 50) continue;
      for (let j = 0; j < 4; j++) {
        const hh = hash32(tx, ty, 100 + j);
        const x = tx + (hh & 255) / 256, y = ty + ((hh >>> 8) & 255) / 256, art = (hh >>> 16) & 15;
        if (art < 7) { gras.moveTo(x, y); gras.lineTo(x - 0.05, y - 0.1); gras.moveTo(x + 0.03, y); gras.lineTo(x + 0.04, y - 0.12); gras.moveTo(x + 0.06, y); gras.lineTo(x + 0.11, y - 0.08); }
        else if (art < 9 && saison < 2) { const p = blume[art - 7 + ((hh >>> 20) & 1)]; p.moveTo(x + 0.03, y); p.arc(x, y, 0.03, 0, 7); }
        else if (art === 9) { stein.moveTo(x + 0.06, y); stein.ellipse(x, y, 0.06, 0.04, 0, 0, 7); }
      }
    }
    ctx.lineWidth = 0.022; ctx.strokeStyle = saison === 2 ? 'rgba(120,100,40,0.55)' : saison === 3 ? 'rgba(200,205,210,0.5)' : 'rgba(40,80,30,0.45)'; ctx.stroke(gras);
    ctx.fillStyle = 'rgba(240,230,120,0.9)'; ctx.fill(blume[0]);
    ctx.fillStyle = 'rgba(230,240,250,0.9)'; ctx.fill(blume[1]);
    ctx.fillStyle = 'rgba(200,90,160,0.85)'; ctx.fill(blume[2]);
    ctx.fillStyle = 'rgba(150,146,136,0.9)'; ctx.fill(stein);
  }
  const bs = baeume();
  const liste = [];
  for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK; ty++) for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK; tx++) {
    for (const b of baumeVon(z, c, tx, ty, false)) liste.push(b, nadel[ty * KARTE_B + tx]);
  }
  for (let i = 0; i < liste.length; i += 2) { const [x, y, s] = liste[i]; const ss = s * 1.05; ctx.drawImage(bs.schatten, x - ss / 2 + 0.18, y - ss / 2 + 0.24, ss, ss); }
  for (let i = 0; i < liste.length; i += 2) {
    const [x, y, s, hh] = liste[i];
    const bild = liste[i + 1] ? bs.nadel[saison][(hh >>> 3) % 4] : bs.laub[saison][(hh >>> 3) % 6];
    ctx.drawImage(bild, x - s / 2, y - s / 2, s, s);
  }
  return { cv, baeume: liste.length / 2 };
}

/** Fernsicht: alle großen Bäume auf einem Kartenbild (8 px/Kachel). */
function zeichneFern(z, c, nadel, saison) {
  const ppt = 8;
  const cv = document.createElement('canvas');
  cv.width = KARTE_B * ppt; cv.height = KARTE_H * ppt;
  const ctx = cv.getContext('2d');
  ctx.setTransform(ppt, 0, 0, ppt, 0, 0);
  const bs = baeume();
  for (let ty = 0; ty < KARTE_H; ty++) for (let tx = 0; tx < KARTE_B; tx++) {
    for (const [x, y, s, hh] of baumeVon(z, c, tx, ty, true)) {
      ctx.drawImage(bs.schatten, x - s / 2 + 0.2, y - s / 2 + 0.25, s, s);
      const bild = nadel[ty * KARTE_B + tx] ? bs.nadel[saison][(hh >>> 3) % 4] : bs.laub[saison][(hh >>> 3) % 6];
      ctx.drawImage(bild, x - s / 2, y - s / 2, s, s);
    }
  }
  return cv;
}

/**
 * Zeichnet die Deko-Ebene. ctx steht im Welt-Transform (1 Einheit = 1 Kachel).
 * budget = wie viele Chunks dieses Bild höchstens neu gemalt werden.
 */
export function zeichneDeko(ctx, dk, z, c, k, nadel, kam, saison, budget = 2) {
  const zoom = kam.zoom;
  dk.zeit++;
  if (zoom < 13) {
    const jetzt = performance.now();
    if (!dk.fern || jetzt - dk.fernPruef > 1000) {
      dk.fernPruef = jetzt;
      let s = saison * 7919;
      for (let i = 0; i < z.wald.length; i += 1) if (z.wald[i] >= 50) s = (s * 31 + i + (c.belegt[i] || c.strasse[i] || c.feld[i] ? 7 : 0)) | 0;
      if (s !== dk.fernSig) { dk.fernSig = s; dk.fern = zeichneFern(z, c, nadel, saison); }
    }
    ctx.drawImage(dk.fern, 0, 0, KARTE_B, KARTE_H);
    return 0;
  }
  const stufe = zoom < 40 ? 0 : 1, st = STUFEN[stufe], cache = dk.chunks[stufe];
  const x0 = Math.max(0, Math.floor((kam.x - kam.b / 2 / zoom - 1) / CHUNK)), x1 = Math.min(KARTE_B / CHUNK - 1, Math.floor((kam.x + kam.b / 2 / zoom + 1) / CHUNK));
  const y0 = Math.max(0, Math.floor((kam.y - kam.h / 2 / zoom - 1) / CHUNK)), y1 = Math.min(KARTE_H / CHUNK - 1, Math.floor((kam.y + kam.h / 2 / zoom + 1) / CHUNK));
  let anzahl = 0;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const key = cy * 100 + cx;
    const sig = signatur(z, c, nadel, cx, cy, saison);
    let e = cache.get(key);
    if ((!e || e.sig !== sig) && budget > 0) {
      budget--;
      const n = zeichneChunk(z, c, k, nadel, cx, cy, saison, st);
      e = { cv: n.cv, sig, t: 0, baeume: n.baeume };
      cache.set(key, e);
      if (cache.size > st.max) {
        let alt = null, at = Infinity;
        for (const [kk, v] of cache) if (v.t < at) { at = v.t; alt = kk; }
        cache.delete(alt);
      }
    }
    if (!e) continue;
    e.t = dk.zeit;
    anzahl += e.baeume;
    ctx.drawImage(e.cv, cx * CHUNK - RAND, cy * CHUNK - RAND, CHUNK + 2 * RAND, CHUNK + 2 * RAND);
  }
  return anzahl;
}
