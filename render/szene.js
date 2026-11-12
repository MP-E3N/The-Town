/**
 * szene.js — Zeichnet ein Bild der Welt.
 *
 * ZWECK:    Gelände, Zonen, Felder, Straßen/Brücken, Gebäude, Bäume, Figuren, Tiere, Effekte.
 * LIEST:    Zustand (nur lesen!), abgeleitete Raster, Sprites, Kamera, UI-Wahl
 * SCHREIBT: nur eigene Darstellungsdaten (Partikel, Passanten, Animationen)
 * REGEL:    Welt-Transform: 1 Einheit = 1 Kachel. Alles außerhalb der Sicht wird übersprungen.
 *           Darstellungs-Zufall (Math.random) ist erlaubt; er beeinflusst nie die Simulation.
 * DEBUG:    spiel.szene.stat zeigt Zeichenzeiten und Anzahlen.
 */

import { KARTE_B, KARTE_H, LAND_RADIUS, KAMPF } from '../data/werte.js';
import { GEBAEUDE, ZONEN } from '../data/gebaeude.js';
import { karteFuer } from '../sim/karte.js';
import { abgeleitet } from '../sim/abgeleitet.js';
import { wegGecached } from '../sim/pfad.js';
import { tuer, tuerKachel } from '../sim/baumeister.js';
import { hash32, datum } from '../sim/lib.js';
import { erzeugeGelaende, zeichneGelaende } from './gelaende.js';
import { gebaeudeSprite, baeume, figurSprites, figurSchatten, tierSprite } from './sprites.js';
import { sicht } from './kamera.js';

const RAD = Math.PI / 180;
const FIGUR_GROESSE = 0.54; // Kacheln

export function erzeugeSzene(canvas, z) {
  const k = karteFuer(z.seed);
  const g = k.g;
  const nadel = new Uint8Array(KARTE_B * KARTE_H);
  for (let i = 0; i < nadel.length; i++) nadel[i] = g.nadel((i % KARTE_B) + 0.5, Math.floor(i / KARTE_B) + 0.5) > 0.5 ? 1 : 0;
  const sz = {
    canvas, ctx: canvas.getContext('2d'), gr: erzeugeGelaende(z.seed), k, nadel,
    zonen: document.createElement('canvas'), zonenVersion: -1,
    strassen: { version: -1, liste: [] },
    partikel: [], passanten: [], anims: [], pfeile: [], einheitAlt: new Map(), laufPhase: new Map(),
    letzteEreignis: z.ereignisNr, brennt: new Map(), arbeitsplatz: new Map(), wege: new Map(),
    zeit: 0, schnee: [], stat: {},
  };
  sz.zonen.width = KARTE_B; sz.zonen.height = KARTE_H;
  baeume();
  return sz;
}

// ── Hilfen ─────────────────────────────────────────────────────────────
function sichtbar(v, x, y, r) { return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1; }

function zeichneGedreht(ctx, bild, x, y, w, h, winkel) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(winkel);
  ctx.drawImage(bild, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function zonenBild(sz, z) {
  if (sz.zonenVersion === z.zonenVersion) return;
  sz.zonenVersion = z.zonenVersion;
  const c = sz.zonen.getContext('2d');
  const img = c.createImageData(KARTE_B, KARTE_H);
  for (let i = 0; i < z.zone.length; i++) {
    const zo = z.zone[i];
    if (!zo) continue;
    const f = ZONEN[zo].farbe;
    img.data[i * 4] = f[0]; img.data[i * 4 + 1] = f[1]; img.data[i * 4 + 2] = f[2]; img.data[i * 4 + 3] = 150;
  }
  c.putImageData(img, 0, 0);
}

/** Straßen als Path2D in Kachel-Einheiten, Brückenstücke über Wasser. */
function strassenCache(sz, z) {
  if (sz.strassen.version === z.version) return sz.strassen.liste;
  const k = sz.k;
  const liste = [];
  for (const s of z.strassen) {
    const p = s.punkte, n = p.length / 2;
    const pfad = new Path2D();
    const pt = (i) => [p[i * 2] / 1000, p[i * 2 + 1] / 1000];
    let [x0, y0] = pt(0);
    pfad.moveTo(x0, y0);
    for (let i = 1; i < n - 1; i++) {
      const [x1, y1] = pt(i), [x2, y2] = pt(i + 1);
      pfad.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
    }
    const [xe, ye] = pt(n - 1);
    pfad.lineTo(xe, ye);
    // Brücken: Abtasten entlang der Punkte
    const bruecken = [];
    let lauf = null;
    for (let i = 0; i < n - 1; i++) {
      const [ax, ay] = pt(i), [bx, by] = pt(i + 1);
      const l = Math.hypot(bx - ax, by - ay), st = Math.max(1, Math.ceil(l / 0.2));
      for (let s2 = 0; s2 < st; s2++) {
        const x = ax + (bx - ax) * s2 / st, y = ay + (by - ay) * s2 / st;
        const w = k.wasser[Math.floor(y) * KARTE_B + Math.floor(x)];
        if (w) { if (!lauf) { lauf = [[x - (bx - ax) / l * 0.6, y - (by - ay) / l * 0.6]]; } lauf.push([x, y]); }
        else if (lauf) { lauf.push([x + (bx - ax) / l * 0.6, y + (by - ay) / l * 0.6]); bruecken.push(lauf); lauf = null; }
      }
    }
    if (lauf) bruecken.push(lauf);
    liste.push({ s, pfad, bruecken, breite: s.breite / 1000 });
  }
  sz.strassen = { version: z.version, liste };
  return liste;
}

function wegPunkte(sz, z, von, nach) {
  const key = von.id + '>' + nach.id + '|' + z.version;
  let w = sz.wege.get(key);
  if (w) return w;
  const pfad = wegGecached(z, tuerKachel(von), tuerKachel(nach), 'buerger');
  const a = tuer(von), b = tuer(nach);
  let pts = [[a.x / 1000, a.y / 1000]];
  if (pfad) for (let i = 1; i < pfad.length - 1; i++) pts.push([(pfad[i] % KARTE_B) + 0.5, Math.floor(pfad[i] / KARTE_B) + 0.5]);
  pts.push([b.x / 1000, b.y / 1000]);
  // glätten (Chaikin, 2×)
  for (let r = 0; r < 2 && pts.length > 2; r++) {
    const o = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; o.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
    o.push(pts[pts.length - 1]); pts = o;
  }
  const laengen = [0];
  for (let i = 1; i < pts.length; i++) laengen.push(laengen[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  w = { pts, laengen, gesamt: laengen[laengen.length - 1] };
  if (sz.wege.size > 400) sz.wege.clear();
  sz.wege.set(key, w);
  return w;
}

function punktAuf(w, t) {
  const d = Math.max(0, Math.min(1, t)) * w.gesamt;
  let i = 1;
  while (i < w.laengen.length - 1 && w.laengen[i] < d) i++;
  const a = w.pts[i - 1], b = w.pts[i], l = w.laengen[i] - w.laengen[i - 1] || 1;
  const f = (d - w.laengen[i - 1]) / l;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, w: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

function figur(ctx, typ, x, y, winkel, phase, aktion, s = FIGUR_GROESSE) {
  const sp = figurSprites(typ);
  ctx.drawImage(figurSchatten(), x - s / 2 + 0.04, y - s / 2 + 0.05, s, s);
  const bild = aktion >= 0 ? sp.aktion[aktion] : sp.lauf[phase & 3];
  zeichneGedreht(ctx, bild, x, y, s, s, winkel + Math.PI / 2);
}

// ── Partikel ───────────────────────────────────────────────────────────
function partikel(sz, typ, x, y, vx, vy, leben, groesse) {
  if (sz.partikel.length > 500) return;
  sz.partikel.push({ typ, x, y, vx, vy, t: 0, leben, groesse });
}

function partikelZeichnen(sz, ctx, dt) {
  const neu = [];
  for (const p of sz.partikel) {
    p.t += dt;
    if (p.t >= p.leben) continue;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const f = p.t / p.leben;
    if (p.typ === 'rauch') {
      p.vx += 0.02 * dt;
      ctx.fillStyle = `rgba(${200 - f * 40},${200 - f * 40},${205 - f * 40},${0.35 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.groesse * (0.5 + f * 1.6), 0, 7); ctx.fill();
    } else if (p.typ === 'qualm') {
      ctx.fillStyle = `rgba(40,36,34,${0.45 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.groesse * (0.6 + f * 2), 0, 7); ctx.fill();
    } else if (p.typ === 'feuer') {
      ctx.fillStyle = `rgba(255,${180 - f * 140},${40},${0.9 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.groesse * (1 - f * 0.6), 0, 7); ctx.fill();
    } else if (p.typ === 'funke') {
      ctx.fillStyle = `rgba(255,${220 - f * 120},80,${1 - f})`;
      ctx.fillRect(p.x, p.y, p.groesse, p.groesse);
    } else if (p.typ === 'staub' || p.typ === 'span') {
      p.vx *= 0.92; p.vy *= 0.92;
      ctx.fillStyle = p.typ === 'span' ? `rgba(196,150,90,${1 - f})` : `rgba(150,130,100,${0.5 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.groesse * (p.typ === 'staub' ? 1 + f : 1), 0, 7); ctx.fill();
    } else if (p.typ === 'stein') {
      p.vx *= 0.9; p.vy *= 0.9;
      ctx.fillStyle = `rgba(170,164,150,${1 - f})`; ctx.fillRect(p.x, p.y, p.groesse, p.groesse);
    }
    neu.push(p);
  }
  sz.partikel = neu;
}

// ── Passanten (nur Optik) ──────────────────────────────────────────────
function passantenPflegen(sz, z, dt) {
  const h = z.herren[0];
  const liste = strassenCache(sz, z).filter((r) => r.s.art !== 'weg' || Math.random() < 0.3);
  const soll = Math.min(70, Math.floor(h.bewohner * 0.55));
  while (sz.passanten.length < soll && liste.length) {
    const r = liste[Math.floor(Math.random() * liste.length)];
    const p = r.s.punkte;
    if (p.length < 4) break;
    sz.passanten.push({ r, i: Math.floor(Math.random() * (p.length / 2 - 1)), f: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, v: 0.55 + Math.random() * 0.5, typ: Math.random() < 0.45 ? 'buergerin' : 'buerger', seite: (Math.random() - 0.5) * 0.5, phase: 0, x: 0, y: 0, w: 0, warte: 0, ziel: null });
  }
  if (sz.passanten.length > soll + 3) sz.passanten.length = soll;
  for (const w of sz.passanten) {
    if (w.ziel) { // Zuzügler laufen zum Markt
      const dx = w.ziel.x - w.x, dy = w.ziel.y - w.y, d = Math.hypot(dx, dy);
      if (d < 0.4) { w.ziel = null; w.weg = true; continue; }
      w.x += dx / d * w.v * dt; w.y += dy / d * w.v * dt; w.w = Math.atan2(dy, dx); w.phase += dt * w.v * 7;
      continue;
    }
    if (w.warte > 0) { w.warte -= dt; continue; }
    const p = w.r.s.punkte, n = p.length / 2;
    if (w.i >= n - 1) w.i = n - 2;
    const ax = p[w.i * 2] / 1000, ay = p[w.i * 2 + 1] / 1000, bx = p[w.i * 2 + 2] / 1000, by = p[w.i * 2 + 3] / 1000;
    const l = Math.hypot(bx - ax, by - ay) || 0.01;
    w.f += w.dir * w.v * dt / l;
    if (w.f > 1) { w.i++; w.f = 0; if (w.i >= n - 1) { w.i = n - 2; w.f = 1; w.dir = -1; w.warte = Math.random() * 2; } }
    else if (w.f < 0) { w.i--; w.f = 1; if (w.i < 0) { w.i = 0; w.f = 0; w.dir = 1; w.warte = Math.random() * 2; } }
    const nx = -(by - ay) / l, ny = (bx - ax) / l;
    w.x = ax + (bx - ax) * w.f + nx * w.seite * w.r.breite;
    w.y = ay + (by - ay) * w.f + ny * w.seite * w.r.breite;
    w.w = Math.atan2((by - ay) * w.dir, (bx - ax) * w.dir);
    w.phase += dt * w.v * 7;
    if (Math.random() < 0.0015) w.warte = 1 + Math.random() * 3;
  }
  sz.passanten = sz.passanten.filter((w) => !w.weg);
}

/** Neue Ereignisse aus der Simulation in Animationen übersetzen. */
function ereignisseLesen(sz, z) {
  const k = sz.k;
  for (const e of z.ereignisse) {
    if (e.nr <= sz.letzteEreignis) continue;
    if (e.typ === 'pfeil') {
      const g = z.gebaeude[e.von];
      sz.pfeile.push({ ax: g.x / 1000, ay: g.y / 1000, bx: e.x / 1000, by: e.y / 1000, t: 0 });
    } else if (e.typ === 'baum') {
      const x = (e.kachel % KARTE_B) + 0.5, y = Math.floor(e.kachel / KARTE_B) + 0.5;
      sz.anims.push({ typ: 'baumfall', x, y, t: 0, leben: 1.4, nadel: sz.nadel[e.kachel], w: Math.random() * 6.28 });
      for (let i = 0; i < 8; i++) partikel(sz, 'span', x, y, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0.8, 0.04);
    } else if (e.typ === 'tot') {
      sz.anims.push({ typ: 'tot', art: e.art, x: e.x / 1000, y: e.y / 1000, w: (e.blick || 0) * RAD, t: 0, leben: 6 });
    } else if (e.typ === 'zuzug') {
      // Zuzügler vom Kartenrand entlang der Handelsstraße
      const markt = z.gebaeude[z.herren[e.herr].markt];
      const haupt = z.strassen.filter((s) => s.art === 'haupt');
      for (let i = 0; i < e.n; i++) {
        const s = haupt[1 + (i % Math.max(1, haupt.length - 1))] || haupt[0];
        if (!s) break;
        const p = s.punkte, n = p.length / 2;
        const start = Math.max(0, n - 1 - i);
        sz.passanten.push({ x: p[start * 2] / 1000 + i * 0.3, y: p[start * 2 + 1] / 1000, ziel: { x: markt.x / 1000 + (Math.random() - 0.5) * 2, y: markt.y / 1000 + (Math.random() - 0.5) * 2 }, v: 1.1, typ: i % 2 ? 'buergerin' : 'traeger', phase: 0, w: 0, warte: 0 });
      }
    } else if (e.typ === 'ernte') {
      const f = z.felder[e.feld];
      if (f) for (let i = 0; i < 14; i++) partikel(sz, 'staub', f.x / 1000 + (Math.random() - 0.5) * 2, f.y / 1000 + (Math.random() - 0.5) * 2, 0, -0.1, 1.5, 0.12);
    }
    void k;
  }
  sz.letzteEreignis = z.ereignisNr;
}

// ── Hauptfunktion ──────────────────────────────────────────────────────
export function zeichneSzene(sz, z, kam, ui, alpha, dt, dtEcht) {
  const t0 = performance.now();
  sz.zeit += dtEcht;
  const { ctx, canvas, k } = sz;
  const dpr = canvas.width / kam.b;
  const c = abgeleitet(z);
  const d = datum(z.tick);
  const saison = d.jahreszeit;
  const zoom = kam.zoom;
  const v = sicht(kam, 2);
  ereignisseLesen(sz, z);

  // 1) Gelände in Bildschirm-Pixeln
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#20303a'; ctx.fillRect(0, 0, kam.b, kam.h);
  zeichneGelaende(ctx, sz.gr, kam, 2);
  if (saison === 2) { ctx.fillStyle = 'rgba(190,120,40,0.10)'; ctx.fillRect(0, 0, kam.b, kam.h); }
  if (saison === 1) { ctx.fillStyle = 'rgba(230,210,120,0.05)'; ctx.fillRect(0, 0, kam.b, kam.h); }

  // 2) Welt-Transform
  const welt = () => ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (kam.b / 2 - kam.x * zoom), dpr * (kam.h / 2 - kam.y * zoom));
  welt();

  // Wasser glitzert
  if (zoom >= 18) {
    ctx.strokeStyle = 'rgba(220,240,255,0.35)'; ctx.lineWidth = 0.05;
    const tx0 = Math.max(0, Math.floor(v.x0)), tx1 = Math.min(KARTE_B - 1, Math.ceil(v.x1)), ty0 = Math.max(0, Math.floor(v.y0)), ty1 = Math.min(KARTE_H - 1, Math.ceil(v.y1));
    ctx.beginPath();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * KARTE_B + tx;
      if (!k.wasser[i] || c.strasse[i]) continue;
      const hsh = hash32(tx, ty, 9);
      const ph = (sz.zeit * 0.6 + (hsh & 255) / 40) % 3;
      if (ph > 1.2) continue;
      const x = tx + ((hsh >> 8) & 255) / 255, y = ty + ((hsh >> 16) & 255) / 255 + ph * 0.1;
      ctx.moveTo(x, y); ctx.lineTo(x + 0.25 * Math.sin(ph * 2.6), y);
    }
    ctx.stroke();
  }

  // Gras, Blumen, Steinchen beim Nahzoom (nur Optik, weltfest per Hash)
  if (zoom >= 30) {
    const tx0 = Math.max(0, Math.floor(v.x0)), tx1 = Math.min(KARTE_B - 1, Math.ceil(v.x1)), ty0 = Math.max(0, Math.floor(v.y0)), ty1 = Math.min(KARTE_H - 1, Math.ceil(v.y1));
    const gras = new Path2D(), blume = [new Path2D(), new Path2D(), new Path2D()], stein = new Path2D();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
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
    ctx.lineWidth = 0.022; ctx.strokeStyle = saison === 2 ? 'rgba(120,100,40,0.55)' : 'rgba(40,80,30,0.45)'; ctx.stroke(gras);
    ctx.fillStyle = 'rgba(240,230,120,0.9)'; ctx.fill(blume[0]);
    ctx.fillStyle = 'rgba(230,240,250,0.9)'; ctx.fill(blume[1]);
    ctx.fillStyle = 'rgba(200,90,160,0.85)'; ctx.fill(blume[2]);
    ctx.fillStyle = 'rgba(150,146,136,0.9)'; ctx.fill(stein);
  }

  // Zonen
  zonenBild(sz, z);
  const zonenAlpha = ui.werkzeug && ui.werkzeug.typ === 'zone' ? 0.6 : ui.zonenZeigen ? 0.35 : 0.16;
  ctx.globalAlpha = zonenAlpha; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sz.zonen, 0, 0, KARTE_B, KARTE_H);
  ctx.globalAlpha = 1;

  // Felder und Weiden
  for (const f of z.felder) {
    if (f.weg) continue;
    const fx = f.x / 1000, fy = f.y / 1000, fb = f.b / 1000, ft = f.t / 1000;
    if (!sichtbar(v, fx, fy, Math.max(fb, ft))) continue;
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(f.w * RAD);
    if (f.art === 'weide') {
      ctx.fillStyle = 'rgba(110,160,70,0.55)'; ctx.fillRect(-fb / 2, -ft / 2, fb, ft);
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 0.05; ctx.setLineDash([0.18, 0.08]);
      ctx.strokeRect(-fb / 2, -ft / 2, fb, ft); ctx.setLineDash([]);
    } else {
      const reif = f.phase === 'reif', w = f.phase === 'wachsend' ? Math.min(1, f.stand / 5000) : 0;
      let col;
      if (reif) col = [206, 176, 76];
      else if (w > 0) col = w < 0.5 ? [Math.round(120 - w * 60), Math.round(96 + w * 80), 56] : [Math.round(90 + (w - 0.5) * 140), Math.round(136 + (w - 0.5) * 50), Math.round(56 - (w - 0.5) * 20)];
      else col = [122, 94, 62];
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.fillRect(-fb / 2, -ft / 2, fb, ft);
      if (zoom > 9) {
        ctx.strokeStyle = `rgba(${col[0] * 0.7},${col[1] * 0.7},${col[2] * 0.7},0.75)`; ctx.lineWidth = 0.06;
        ctx.beginPath();
        for (let x = -fb / 2 + 0.12; x < fb / 2; x += 0.2) { ctx.moveTo(x, -ft / 2 + 0.05); ctx.lineTo(x, ft / 2 - 0.05); }
        ctx.stroke();
        if ((reif || w > 0.25) && zoom > 26) {
          ctx.strokeStyle = reif ? 'rgba(240,214,120,0.9)' : 'rgba(150,200,90,0.8)';
          ctx.lineWidth = 0.07; ctx.setLineDash([0.06, 0.05]); ctx.lineDashOffset = Math.sin(sz.zeit * 1.3 + fx) * 0.04;
          ctx.beginPath();
          for (let x = -fb / 2 + 0.22; x < fb / 2; x += 0.2) { ctx.moveTo(x, -ft / 2 + 0.08); ctx.lineTo(x, ft / 2 - 0.08); }
          ctx.stroke(); ctx.setLineDash([]);
        }
      }
      ctx.strokeStyle = 'rgba(56,84,40,0.85)'; ctx.lineWidth = 0.08; ctx.setLineDash([0.1, 0.05]);
      ctx.strokeRect(-fb / 2, -ft / 2, fb, ft); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // Straßen
  const str = strassenCache(sz, z);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of str) { ctx.strokeStyle = 'rgba(92,72,48,0.75)'; ctx.lineWidth = r.breite + 0.16; ctx.stroke(r.pfad); }
  for (const r of str) { ctx.strokeStyle = r.s.art === 'haupt' ? '#a8916a' : '#9e8862'; ctx.lineWidth = r.breite; ctx.stroke(r.pfad); }
  if (zoom > 16) for (const r of str) {
    ctx.strokeStyle = 'rgba(190,172,130,0.45)'; ctx.lineWidth = r.breite * 0.35; ctx.stroke(r.pfad);
    if (zoom > 34) { ctx.strokeStyle = 'rgba(100,80,56,0.35)'; ctx.lineWidth = 0.04; ctx.setLineDash([0.3, 0.2]); ctx.stroke(r.pfad); ctx.setLineDash([]); }
  }
  for (const r of str) for (const b of r.bruecken) {
    ctx.beginPath(); ctx.moveTo(b[0][0], b[0][1]); for (const p of b) ctx.lineTo(p[0], p[1]);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#3e2c1c'; ctx.lineWidth = r.breite + 0.42; ctx.stroke();
    ctx.strokeStyle = '#8a6440'; ctx.lineWidth = r.breite + 0.25; ctx.setLineDash([0.13, 0.035]); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }

  if (saison === 3) {
    welt();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(236,240,248,0.5)'; ctx.fillRect(0, 0, kam.b, kam.h);
    welt();
  }

  // Ruinen
  for (const ru of z.ruinen) {
    const rx = ru.x / 1000, ry = ru.y / 1000;
    if (!sichtbar(v, rx, ry, 3)) continue;
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(ru.w * RAD);
    ctx.fillStyle = 'rgba(40,34,30,0.75)'; ctx.fillRect(-ru.b / 2000, -ru.t / 2000, ru.b / 1000, ru.t / 1000);
    ctx.strokeStyle = 'rgba(20,16,14,0.9)'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(-ru.b / 2200, -ru.t / 2400); ctx.lineTo(ru.b / 2600, ru.t / 2200); ctx.moveTo(ru.b / 2400, -ru.t / 2600); ctx.lineTo(-ru.b / 3000, ru.t / 2400); ctx.stroke();
    ctx.restore();
    if (z.tick - ru.tick < 900 && Math.random() < dtEcht * 3) partikel(sz, 'qualm', rx + (Math.random() - 0.5) * ru.b / 1000, ry + (Math.random() - 0.5) * ru.t / 1000, 0.1, -0.25, 3, 0.12);
  }

  // Brennende Gebäude bestimmen (Räuber plündern)
  for (const u of z.einheiten) if (u.art === 'raeuber' && u.zustand === 'pluendern' && u.ziel >= 0) sz.brennt.set(u.ziel, sz.zeit + 4);

  // Gebäude: Schatten, dann Bilder
  const winter = saison === 3;
  const sOff = 0.12;
  const gl = [];
  for (const g of z.gebaeude) {
    if (g.zustand === 'weg') continue;
    const gx = g.x / 1000, gy = g.y / 1000, gb = g.b / 1000, gt = g.t / 1000;
    if (!sichtbar(v, gx, gy, Math.max(gb, gt))) continue;
    gl.push(g);
  }
  for (const g of gl) {
    if (g.art === 'platz') continue;
    const sp = gebaeudeSprite(g.art, g.variante, g.b, g.t, winter);
    ctx.globalAlpha = g.zustand === 'bau' ? 0.12 : 0.3;
    zeichneGedreht(ctx, sp.schatten, g.x / 1000 + sOff * (GEBAEUDE[g.art].mauer ? 0.6 : 1.4), g.y / 1000 + sOff * (GEBAEUDE[g.art].mauer ? 0.8 : 1.8), g.b / 1000, g.t / 1000, g.w * RAD);
  }
  ctx.globalAlpha = 1;
  for (const g of gl) {
    const sp = gebaeudeSprite(g.art, g.variante, g.b, g.t, winter);
    const gx = g.x / 1000, gy = g.y / 1000, gb = g.b / 1000, gt = g.t / 1000;
    if (g.zustand === 'bau') {
      const p = Math.min(1, g.arbeit / GEBAEUDE[g.art].arbeit);
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(g.w * RAD);
      ctx.fillStyle = 'rgba(120,100,70,0.8)'; ctx.fillRect(-gb / 2, -gt / 2, gb, gt);
      ctx.strokeStyle = '#8a8478'; ctx.lineWidth = 0.08; ctx.strokeRect(-gb / 2 + 0.05, -gt / 2 + 0.05, gb - 0.1, gt - 0.1);
      if (p > 0.05) {
        const hh = gt * p;
        ctx.drawImage(sp.cv, 0, sp.cv.height * (1 - p), sp.cv.width, sp.cv.height * p, -gb / 2, gt / 2 - hh, gb, hh);
      }
      ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let x = -gb / 2 + 0.1; x <= gb / 2; x += 0.45) { ctx.moveTo(x, -gt / 2 + 0.05); ctx.lineTo(x, gt / 2 - 0.05); }
      ctx.moveTo(-gb / 2, -gt / 2); ctx.lineTo(gb / 2, gt / 2);
      ctx.stroke();
      ctx.fillStyle = '#a07a4a'; ctx.fillRect(-gb / 2 - 0.3, -gt / 2, 0.25, 0.5);
      ctx.fillStyle = '#9a968c'; ctx.fillRect(gb / 2 + 0.05, gt / 2 - 0.4, 0.3, 0.3);
      ctx.restore();
    } else {
      zeichneGedreht(ctx, sp.cv, gx, gy, gb, gt, g.w * RAD);
      if (g.hp < g.hpMax && zoom > 14 && !GEBAEUDE[g.art].begehbar) {
        const f = g.hp / g.hpMax;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(gx - 0.5, gy - gt / 2 - 0.35, 1, 0.12);
        ctx.fillStyle = f > 0.5 ? '#8c3' : '#d43'; ctx.fillRect(gx - 0.5, gy - gt / 2 - 0.35, f, 0.12);
      }
    }
    // Rauch aus Kaminen
    if (g.zustand === 'fertig' && zoom >= 12 && sp.kamine.length) {
      const rate = (g.art === 'haus' ? [0.25, 0.12, 0.45, 0.9][saison] : g.art === 'schmiede' ? (g.belegt ? 2 : 0.2) : 0.15) * dt * 1.5;
      if (Math.random() < rate) {
        const km = sp.kamine[Math.floor(Math.random() * sp.kamine.length)];
        const cw = Math.cos(g.w * RAD), sw = Math.sin(g.w * RAD);
        partikel(sz, 'rauch', gx + km.x * cw - km.y * sw, gy + km.x * sw + km.y * cw, 0.08 + Math.random() * 0.05, -0.12 - Math.random() * 0.06, 3.2 + Math.random() * 2, 0.13);
      }
    }
    if (g.art === 'schmiede' && g.belegt && Math.random() < dt * 4) {
      const p = tuer(g); partikel(sz, 'funke', p.x / 1000 + (Math.random() - 0.5) * 0.4, p.y / 1000 + 0.3, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0.35, 0.05);
    }
    // Feuer
    const br = sz.brennt.get(g.id);
    if (br && br > sz.zeit && Math.random() < dtEcht * 18) {
      partikel(sz, 'feuer', gx + (Math.random() - 0.5) * gb * 0.8, gy + (Math.random() - 0.5) * gt * 0.8, (Math.random() - 0.5) * 0.2, -0.5 - Math.random() * 0.3, 0.7, 0.18);
      if (Math.random() < 0.4) partikel(sz, 'qualm', gx, gy, 0.1, -0.35, 3, 0.18);
    }
  }

  // Bäume
  const bs = baeume();
  const tx0 = Math.max(0, Math.floor(v.x0)), tx1 = Math.min(KARTE_B - 1, Math.ceil(v.x1)), ty0 = Math.max(0, Math.floor(v.y0)), ty1 = Math.min(KARTE_H - 1, Math.ceil(v.y1));
  const viele = zoom < 11;
  const baumListe = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * KARTE_B + tx, wv = z.wald[i];
    if (wv <= 0 || c.strasse[i] || c.belegt[i] || c.feld[i]) continue;
    const n = viele ? (wv >= 50 ? 1 : 0) : Math.ceil(wv / 25);
    for (let j = 0; j < n; j++) {
      const hh = hash32(tx, ty, j);
      const x = tx + 0.2 + ((hh & 255) / 255) * 0.6, y = ty + 0.2 + (((hh >> 8) & 255) / 255) * 0.6;
      const gross = viele ? 1.5 : (0.75 + ((hh >> 16) & 255) / 255 * 0.5) * (wv < 25 ? 0.5 : 1);
      baumListe.push(x, y, gross, hh, sz.nadel[i]);
    }
  }
  for (let i = 0; i < baumListe.length; i += 5) {
    const s = baumListe[i + 2] * 1.05;
    ctx.drawImage(bs.schatten, baumListe[i] - s / 2 + 0.18, baumListe[i + 1] - s / 2 + 0.24, s, s);
  }
  for (let i = 0; i < baumListe.length; i += 5) {
    const x = baumListe[i], y = baumListe[i + 1], s = baumListe[i + 2], hh = baumListe[i + 3];
    const bild = baumListe[i + 4] ? bs.nadel[saison][(hh >>> 3) % 4] : bs.laub[saison][(hh >>> 3) % 6];
    // leichtes Wiegen beim Nahzoom
    if (zoom > 40) {
      const wz = Math.sin(sz.zeit * 1.2 + x * 0.7 + y) * 0.02;
      zeichneGedreht(ctx, bild, x, y, s, s, wz);
    } else ctx.drawImage(bild, x - s / 2, y - s / 2, s, s);
  }

  // Figuren nur ab etwas Nähe
  const fig = zoom >= 10;
  const tickF = z.tick + alpha;
  if (fig) {
    // Tiere auf Weiden
    for (const f of z.felder) {
      if (f.weg || f.art !== 'weide') continue;
      const fx = f.x / 1000, fy = f.y / 1000;
      if (!sichtbar(v, fx, fy, 4)) continue;
      const kuh = f.id % 2 === 1, n = kuh ? 3 : 6;
      const cw = Math.cos(f.w * RAD), sw = Math.sin(f.w * RAD);
      for (let i = 0; i < n; i++) {
        const ph = i * 1.7 + f.id;
        const lu = Math.sin(sz.zeit * 0.05 + ph) * f.b / 2600, lv = Math.cos(sz.zeit * 0.043 + ph * 1.3) * f.t / 2600;
        const dlu = Math.cos(sz.zeit * 0.05 + ph) * 0.05, dlv = -Math.sin(sz.zeit * 0.043 + ph * 1.3) * 0.043;
        const x = fx + lu * cw - lv * sw, y = fy + lu * sw + lv * cw;
        const wi = Math.atan2(dlu * sw + dlv * cw, dlu * cw - dlv * sw) + Math.PI / 2;
        zeichneGedreht(ctx, tierSprite(kuh ? 'kuh' : 'schaf', Math.sin(sz.zeit * 2 + ph) > 0.6 ? 2 : 0), x, y, kuh ? 0.75 : 0.5, kuh ? 0.75 : 0.5, wi);
      }
    }
    // Arbeiter an ihren Plätzen
    for (const g of gl) {
      if (!g.belegt) continue;
      const gx = g.x / 1000, gy = g.y / 1000;
      const takt = Math.floor(sz.zeit * 2.6 + g.id) % 2;
      if (g.zustand === 'bau') {
        for (let i = 0; i < g.belegt; i++) {
          const a = g.w * RAD + i * 2.1 + 0.6, r = Math.max(g.b, g.t) / 2000 + 0.2;
          const x = gx + Math.cos(a) * r, y = gy + Math.sin(a) * r;
          figur(ctx, 'bauarbeiter', x, y, a + Math.PI, 0, (takt + i) % 2);
          if (Math.random() < dt * 1.5) partikel(sz, 'staub', x, y, 0, 0, 0.8, 0.06);
        }
      } else if (g.art === 'hof' && g.aufgabeFeld >= 0) {
        const f = z.felder[g.aufgabeFeld];
        if (!f) continue;
        const fx = f.x / 1000, fy = f.y / 1000, cw = Math.cos(f.w * RAD), sw = Math.sin(f.w * RAD);
        for (let i = 0; i < g.belegt; i++) {
          const lu = (i ? 0.25 : -0.25) * f.b / 1000, s = Math.sin(sz.zeit * 0.25 + i * 2) * f.t / 2400;
          const x = fx + lu * cw - s * sw, y = fy + lu * sw + s * cw;
          const rich = Math.cos(sz.zeit * 0.25 + i * 2) >= 0 ? 1 : -1;
          figur(ctx, 'bauer', x, y, f.w * RAD + Math.PI / 2 * rich, Math.floor(sz.zeit * 4), takt === 0 && f.phase === 'reif' ? 1 : -1);
        }
      } else if (g.art === 'holzfaeller') {
        let ap = sz.arbeitsplatz.get(g.id);
        if (!ap || z.wald[ap.k] < 25 || sz.zeit > ap.bis) {
          let best = -1, bd = 1e9; const tx = Math.floor(gx), ty = Math.floor(gy);
          for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
            const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= KARTE_B || y >= KARTE_H) continue;
            const i = y * KARTE_B + x; if (z.wald[i] < 25 || c.belegt[i]) continue;
            const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; }
          }
          ap = { k: best, bis: sz.zeit + 8 }; sz.arbeitsplatz.set(g.id, ap);
        }
        if (ap.k >= 0) for (let i = 0; i < g.belegt; i++) {
          const bx = (ap.k % KARTE_B) + 0.5, by = Math.floor(ap.k / KARTE_B) + 0.5;
          const a = i * 3.1 + 0.8, x = bx + Math.cos(a) * 0.42, y = by + Math.sin(a) * 0.42;
          figur(ctx, 'holzfaeller', x, y, a + Math.PI, 0, (takt + i) % 2);
          if (takt && Math.random() < dt * 3) partikel(sz, 'span', bx, by, (Math.random() - 0.5), (Math.random() - 0.5), 0.5, 0.035);
        }
      } else if (g.art === 'steinbruch' || g.art === 'erzgrube') {
        for (let i = 0; i < g.belegt; i++) {
          const p = tuer(g), a = g.w * RAD + (i ? 0.6 : -0.6);
          const x = p.x / 1000 + Math.cos(a) * 0.6, y = p.y / 1000 + Math.sin(a) * 0.6;
          figur(ctx, 'bergmann', x, y, g.w * RAD + Math.PI / 2, 0, (takt + i) % 2);
          if (takt && Math.random() < dt * 3) partikel(sz, 'stein', x, y, (Math.random() - 0.5), (Math.random() - 0.5), 0.5, 0.05);
        }
      } else if (g.art === 'fischer') {
        let ap = sz.arbeitsplatz.get(g.id);
        if (!ap) {
          let best = null, bd = 1e9; const tx = Math.floor(gx), ty = Math.floor(gy);
          for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
            const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= KARTE_B || y >= KARTE_H) continue;
            if (k.wasser[y * KARTE_B + x] || c.belegt[y * KARTE_B + x]) continue;
            const nW = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([ox, oy]) => k.wasser[(y + oy) * KARTE_B + x + ox]);
            if (!nW) continue;
            const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = { x: x + 0.5 + nW[0] * 0.35, y: y + 0.5 + nW[1] * 0.35, w: Math.atan2(nW[1], nW[0]) }; }
          }
          ap = best || { x: gx, y: gy, w: 0 }; sz.arbeitsplatz.set(g.id, ap);
        }
        figur(ctx, 'fischer', ap.x, ap.y, ap.w, 0, -1);
        ctx.strokeStyle = 'rgba(40,30,20,0.8)'; ctx.lineWidth = 0.02;
        const ex = ap.x + Math.cos(ap.w) * 1.1, ey = ap.y + Math.sin(ap.w) * 1.1 + Math.sin(sz.zeit * 2) * 0.03;
        ctx.beginPath(); ctx.moveTo(ap.x + Math.cos(ap.w) * 0.2, ap.y + Math.sin(ap.w) * 0.2); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = '#d33'; ctx.beginPath(); ctx.arc(ex, ey, 0.05, 0, 7); ctx.fill();
      }
    }
    // Träger und Erntewagen
    for (const l of z.lieferungen) {
      const von = z.gebaeude[l.von], nach = z.gebaeude[l.nach];
      if (!von || !nach) continue;
      const tt = (tickF - l.start) / l.dauer;
      if (tt < 0 || tt > 2) continue;
      const w = wegPunkte(sz, z, von, nach);
      const p = punktAuf(w, tt <= 1 ? tt : 2 - tt);
      if (!sichtbar(v, p.x, p.y, 1)) continue;
      const rw = tt <= 1 ? p.w : p.w + Math.PI;
      if (l.wagen) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rw);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-0.32, -0.2, 0.7, 0.46);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-0.36, -0.22, 0.6, 0.44);
        if (tt <= 1) { ctx.fillStyle = '#d8b850'; ctx.beginPath(); ctx.ellipse(-0.06, 0, 0.26, 0.17, 0, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-0.2, -0.27, 0.22, 0.06); ctx.fillRect(-0.2, 0.21, 0.22, 0.06);
        ctx.fillStyle = '#8a6a50'; ctx.beginPath(); ctx.ellipse(0.5, 0, 0.2, 0.13, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.arc(0.68, 0, 0.07, 0, 7); ctx.fill();
        ctx.restore();
      } else {
        figur(ctx, tt <= 1 ? 'traeger' : 'buerger', p.x, p.y, rw, Math.floor(sz.zeit * 7 + l.id), -1);
      }
    }
    // Passanten
    passantenPflegen(sz, z, dt);
    for (const w of sz.passanten) {
      if (w.warte > 0 && !w.ziel) { figur(ctx, w.typ, w.x, w.y, w.w, 0, -1); continue; }
      if (sichtbar(v, w.x, w.y, 1)) figur(ctx, w.typ, w.x, w.y, w.w, Math.floor(w.phase), -1);
    }
  }

  // Tote (verblassen)
  sz.anims = sz.anims.filter((a) => (a.t += dtEcht) < a.leben);
  for (const a of sz.anims) {
    if (a.typ === 'tot' && fig) {
      ctx.globalAlpha = Math.min(1, (a.leben - a.t) / 2);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.w + Math.PI / 2); ctx.scale(1.1, 0.7);
      ctx.drawImage(figurSprites(a.art).lauf[0], -0.23, -0.23, 0.46, 0.46);
      ctx.restore();
      ctx.fillStyle = 'rgba(120,20,20,0.35)'; ctx.beginPath(); ctx.arc(a.x + 0.1, a.y + 0.08, 0.14, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (a.typ === 'baumfall') {
      const f = a.t / a.leben;
      ctx.globalAlpha = 1 - f;
      const bild = a.nadel ? bs.nadel[saison][0] : bs.laub[saison][1];
      ctx.save(); ctx.translate(a.x + Math.cos(a.w) * f * 0.8, a.y + Math.sin(a.w) * f * 0.8); ctx.rotate(f * 1.2); ctx.scale(1, 1 - f * 0.6);
      ctx.drawImage(bild, -0.5, -0.5, 1, 1); ctx.restore();
      ctx.globalAlpha = 1;
      ctx.drawImage(bs.stumpf, a.x - 0.1, a.y - 0.1, 0.2, 0.2);
    }
  }

  // Soldaten und Räuber
  const neuAlt = new Map();
  for (const u of z.einheiten) {
    const alt = sz.einheitAlt.get(u.id);
    let x = u.x / 1000, y = u.y / 1000;
    if (alt) { x = alt[0] + (x - alt[0]) * alpha; y = alt[1] + (y - alt[1]) * alpha; }
    neuAlt.set(u.id, [u.x / 1000, u.y / 1000]);
    if (!sichtbar(v, x, y, 1)) continue;
    const ph = (sz.laufPhase.get(u.id) || 0) + (alt ? Math.hypot(u.x / 1000 - alt[0], u.y / 1000 - alt[1]) * 9 : 0);
    sz.laufPhase.set(u.id, ph);
    const kampf = KAMPF[u.art];
    const schlag = u.cd > kampf.takt - 4 ? 1 : -1;
    const typ = u.art === 'soldat' ? 'soldat' : 'raeuber';
    if (fig) {
      figur(ctx, typ, x, y, u.blick * RAD, Math.floor(ph), schlag, 0.62);
      if (u.hp < u.hpMax && zoom > 20) {
        const f = u.hp / u.hpMax;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 0.22, y - 0.38, 0.44, 0.07);
        ctx.fillStyle = u.art === 'soldat' ? '#6c6' : '#d55'; ctx.fillRect(x - 0.22, y - 0.38, 0.44 * f, 0.07);
      }
      if ((u.beuteN + u.beuteG) > 0 && zoom > 20) { ctx.fillStyle = '#d8b850'; ctx.beginPath(); ctx.arc(x + 0.2, y + 0.15, 0.08, 0, 7); ctx.fill(); }
    } else {
      ctx.fillStyle = u.art === 'soldat' ? '#e33' : '#222';
      ctx.beginPath(); ctx.arc(x, y, 0.45, 0, 7); ctx.fill();
      ctx.strokeStyle = u.art === 'soldat' ? '#fff' : '#e33'; ctx.lineWidth = 0.12; ctx.stroke();
    }
  }
  sz.einheitAlt = neuAlt;

  // Pfeile
  sz.pfeile = sz.pfeile.filter((p) => (p.t += dt / 0.4 * 1) < 1);
  ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 0.04;
  for (const p of sz.pfeile) {
    const x = p.ax + (p.bx - p.ax) * p.t, y = p.ay + (p.by - p.ay) * p.t - Math.sin(p.t * Math.PI) * 0.8;
    const dx = p.bx - p.ax, dy = p.by - p.ay, l = Math.hypot(dx, dy) || 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx / l * 0.35, y - dy / l * 0.35); ctx.stroke();
  }

  partikelZeichnen(sz, ctx, dtEcht);

  // Herrschaftsgrenze
  const burg = z.gebaeude[z.herren[0].burg];
  ctx.strokeStyle = ui.werkzeug ? 'rgba(240,210,120,0.75)' : 'rgba(240,210,120,0.3)'; ctx.lineWidth = Math.max(0.08, 2 / zoom);
  ctx.setLineDash([0.8, 0.5]);
  ctx.beginPath(); ctx.arc(burg.x / 1000, burg.y / 1000, LAND_RADIUS, 0, 7); ctx.stroke(); ctx.setLineDash([]);

  // Sammelpunkt
  const sp = z.herren[0].sammelpunkt;
  if (sp) {
    const x = sp.x / 1000, y = sp.y / 1000;
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 0.9); ctx.stroke();
    ctx.fillStyle = '#c0302a'; ctx.beginPath(); ctx.moveTo(x, y - 0.9); ctx.lineTo(x + 0.6, y - 0.75 + Math.sin(sz.zeit * 4) * 0.05); ctx.lineTo(x, y - 0.55); ctx.fill();
  }

  // Auswahl
  if (ui.auswahl >= 0) {
    const g = z.gebaeude[ui.auswahl];
    if (g && g.zustand !== 'weg') {
      ctx.save(); ctx.translate(g.x / 1000, g.y / 1000); ctx.rotate(g.w * RAD);
      ctx.strokeStyle = '#f0d070'; ctx.lineWidth = Math.max(0.06, 2 / zoom); ctx.strokeRect(-g.b / 2000 - 0.1, -g.t / 2000 - 0.1, g.b / 1000 + 0.2, g.t / 1000 + 0.2);
      ctx.restore();
    }
  }
  zeichneWerkzeug(ctx, z, ui, winter, zoom);

  // Schneefall (Bildschirm)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (winter) {
    while (sz.schnee.length < 160) sz.schnee.push({ x: Math.random() * kam.b, y: Math.random() * kam.h, v: 20 + Math.random() * 40, r: 1 + Math.random() * 1.8 });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const s of sz.schnee) {
      s.y += s.v * dtEcht; s.x += Math.sin(sz.zeit + s.v) * 12 * dtEcht;
      if (s.y > kam.h) { s.y = -4; s.x = Math.random() * kam.b; }
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
  } else sz.schnee.length = 0;

  sz.stat = { ms: Math.round((performance.now() - t0) * 10) / 10, baeume: baumListe.length / 5, partikel: sz.partikel.length, passanten: sz.passanten.length, gebaeude: gl.length };
}

function zeichneWerkzeug(ctx, z, ui, winter, zoom) {
  const w = ui.werkzeug;
  if (!w || !ui.maus) return;
  const mx = ui.maus.x, my = ui.maus.y;
  if (w.typ === 'zone') {
    const f = ZONEN[w.zone].farbe;
    ctx.fillStyle = w.zone ? `rgba(${f[0]},${f[1]},${f[2]},0.25)` : 'rgba(255,255,255,0.15)';
    ctx.strokeStyle = w.zone ? `rgb(${f[0]},${f[1]},${f[2]})` : '#fff'; ctx.lineWidth = Math.max(0.06, 2 / zoom);
    ctx.beginPath(); ctx.arc(Math.floor(mx) + 0.5, Math.floor(my) + 0.5, ui.pinsel + 0.5, 0, 7); ctx.fill(); ctx.stroke();
  } else if (w.typ === 'bauen' && ui.geist) {
    const gs = ui.geist, typ = GEBAEUDE[w.art];
    const sp = gebaeudeSprite(w.art, 0, typ.b, typ.t, winter);
    ctx.globalAlpha = 0.7;
    zeichneGedreht(ctx, sp.cv, gs.x / 1000, gs.y / 1000, typ.b / 1000, typ.t / 1000, gs.w * RAD);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(gs.x / 1000, gs.y / 1000); ctx.rotate(gs.w * RAD);
    ctx.strokeStyle = gs.grund ? '#e44' : '#4e4'; ctx.lineWidth = Math.max(0.06, 2 / zoom);
    ctx.strokeRect(-typ.b / 2000, -typ.t / 2000, typ.b / 1000, typ.t / 1000);
    ctx.beginPath(); ctx.moveTo(0, -typ.t / 2000); ctx.lineTo(0, -typ.t / 2000 - 0.5); ctx.stroke();
    ctx.restore();
    if (GEBAEUDE[w.art].schiesst) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([0.3, 0.3]); ctx.beginPath(); ctx.arc(gs.x / 1000, gs.y / 1000, KAMPF.turm.reichweite / 1000, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  } else if (w.typ === 'mauer' && ui.mauerStart) {
    ctx.strokeStyle = w.art === 'mauer' ? 'rgba(200,200,200,0.85)' : 'rgba(160,110,60,0.9)'; ctx.lineWidth = GEBAEUDE[w.art].t / 1000;
    ctx.setLineDash([0.4, 0.15]);
    ctx.beginPath(); ctx.moveTo(ui.mauerStart.x / 1000, ui.mauerStart.y / 1000); ctx.lineTo(mx, my); ctx.stroke(); ctx.setLineDash([]);
  } else if (w.typ === 'abriss' && ui.unterMaus >= 0) {
    const g = z.gebaeude[ui.unterMaus];
    ctx.save(); ctx.translate(g.x / 1000, g.y / 1000); ctx.rotate(g.w * RAD);
    ctx.fillStyle = 'rgba(220,40,40,0.35)'; ctx.fillRect(-g.b / 2000, -g.t / 2000, g.b / 1000, g.t / 1000);
    ctx.restore();
  }
}
