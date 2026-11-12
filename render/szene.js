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
import { erzeugeGelaende, zeichneGelaende, vorrendern } from './gelaende.js';
import { gebaeudeSprite, baeume, figurSprites, figurSchatten, tierSprite, strassenBelag } from './sprites.js';
import { sicht } from './kamera.js';
import { kampfwerte } from '../sim/militaer.js';
import { mauerEnden } from '../sim/befehle.js';
import { erzeugeDeko, zeichneDeko } from './deko.js';

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
    zeit: 0, schnee: [], stat: {}, deko: erzeugeDeko(), dekoBaeume: 0,
  };
  sz.zonen.width = KARTE_B; sz.zonen.height = KARTE_H;
  vorrendern(sz.gr, k.burg.x / 1000, k.burg.y / 1000);
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

/**
 * Straßen für die Darstellung aufbereiten (nur Optik, die Simulation rechnet mit den geraden Strecken).
 * WARUM Flächen statt Striche: Ein dicker Strich mit Kontur sieht aus wie ein Schlauch („Wurm“). Echte Wege
 * sind ausgetretene Erde: Ränder franseln unregelmäßig aus, links und rechts verschieden breit, das Gras ist
 * zum Rand hin abgelaufen. Darum: Mittellinie fast gerade, Ränder je Seite eigenes Rauschen, weiche Randzone,
 * keine dunkle Umrandung.
 */
function catmull(pts) {
  const p = new Path2D();
  if (!pts.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  kurve(p, pts);
  return p;
}
function kurve(p, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}
/** Fläche zwischen linkem und rechtem Rand (Punkte i0..i1). */
function flaeche(links, rechts, i0, i1) {
  const p = new Path2D();
  const l = links.slice(i0, i1 + 1), r = rechts.slice(i0, i1 + 1).reverse();
  p.moveTo(l[0][0], l[0][1]); kurve(p, l);
  p.lineTo(r[0][0], r[0][1]); kurve(p, r);
  p.closePath();
  return p;
}
/** Glattes Rauschen −1..1 entlang des Wegs (mehrere Sinus mit festen Phasen je Straße und Seite). */
function rausch(s, ph) { return Math.sin(s * 0.9 + ph) * 0.5 + Math.sin(s * 2.3 + ph * 1.9) * 0.3 + Math.sin(s * 5.1 + ph * 3.7) * 0.2; }

function strassenCache(sz, z) {
  if (sz.strassen.version === z.version) return sz.strassen.liste;
  const k = sz.k;
  const markt = z.gebaeude[z.herren[0].markt];
  const mx = markt ? markt.x / 1000 : -999, my = markt ? markt.y / 1000 : -999;
  const liste = [];
  for (const s of z.strassen) {
    const p = s.punkte, n = p.length / 2, breite = s.breite / 1000, hb = breite / 2;
    // 1) gleichmäßig abtasten (alle 0,4 Kacheln)
    const roh = [];
    for (let i = 0; i < n - 1; i++) {
      const ax = p[i * 2] / 1000, ay = p[i * 2 + 1] / 1000, bx = p[i * 2 + 2] / 1000, by = p[i * 2 + 3] / 1000;
      const l = Math.hypot(bx - ax, by - ay), st = Math.max(1, Math.round(l / 0.4));
      for (let j = 0; j < st; j++) roh.push([ax + (bx - ax) * j / st, ay + (by - ay) * j / st]);
    }
    roh.push([p[p.length - 2] / 1000, p[p.length - 1] / 1000]);
    // 2) Mittellinie kaum geschwungen, Ränder je Seite eigenes Rauschen; über Wasser exakt (Brücke)
    const gesamt = (roh.length - 1) * 0.4, ph = (s.id * 2.399) % 6.28;
    // Pflaster: Hauptstraße im Stadtkern; Gassen ganz oder gar nicht (sonst graue Flecken an Kreuzungen)
    const mitte = roh[Math.floor(roh.length / 2)];
    const gassePflaster = s.art === 'gasse' && Math.hypot(mitte[0] - mx, mitte[1] - my) < 7;
    const kernAt = (q) => s.art === 'haupt' ? Math.hypot(q[0] - mx, q[1] - my) < 7 : gassePflaster;
    const pts = [], normalen = [], li = [], re = [], liR = [], reR = [], kern = [];
    for (let i = 0; i < roh.length; i++) {
      const a = roh[Math.max(0, i - 1)], b = roh[Math.min(roh.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const sPos = i * 0.4, fade = Math.max(0, Math.min(1, sPos / 1.5, (gesamt - sPos) / 1.5));
      const nass = k.wasser[Math.floor(roh[i][1]) * KARTE_B + Math.floor(roh[i][0])] ? 0 : 1;
      const w = breite * 0.05 * fade * nass * Math.sin(sPos * 0.35 + ph);
      const q = [roh[i][0] + nx * w, roh[i][1] + ny * w];
      const kk = kernAt(q);
      // Pflaster mit Randsteinen: kaum ausgefranst; Erdwege stark
      const f = (kk ? 0.06 : s.art === 'weg' ? 0.3 : 0.22) * nass;
      const wl = hb * (0.92 + f * rausch(sPos, ph)), wr = hb * (0.92 + f * rausch(sPos, ph + 2.1));
      const rl = hb * (1.3 + 0.35 * nass * rausch(sPos * 0.7, ph + 4.2)), rr = hb * (1.3 + 0.35 * nass * rausch(sPos * 0.7, ph + 5.3));
      pts.push(q); normalen.push([nx, ny]); kern.push(kk);
      li.push([q[0] + nx * wl, q[1] + ny * wl]); re.push([q[0] - nx * wr, q[1] - ny * wr]);
      liR.push([q[0] + nx * rl, q[1] + ny * rl]); reR.push([q[0] - nx * rr, q[1] - ny * rr]);
    }
    const randFl = flaeche(liR, reR, 0, pts.length - 1);
    // 3) Abschnitte: Pflaster im Stadtkern (Haupt- und Gassen), sonst Erde/Kies
    const abschnitte = [];
    let i0 = 0;
    for (let i = 1; i <= pts.length; i++) {
      if (i === pts.length || kern[i] !== kern[i0]) {
        const art = kern[i0] ? 'pflaster' : s.art === 'haupt' ? 'kies' : 'erde';
        abschnitte.push({ art, pfad: flaeche(li, re, i0, Math.min(pts.length - 1, i)) });
        i0 = i;
      }
    }
    // 4) Fahrspuren außerhalb des Pflasters; Feldwege: Grasstreifen in der Mitte
    const spuren = new Path2D(), gras = new Path2D();
    const versatz = breite * (s.art === 'weg' ? 0.24 : 0.2);
    for (const sd of [-1, 1]) {
      let auf = false;
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i][0] + normalen[i][0] * versatz * sd, y = pts[i][1] + normalen[i][1] * versatz * sd;
        if (kern[i]) { auf = false; continue; }
        if (!auf) { spuren.moveTo(x, y); auf = true; } else spuren.lineTo(x, y);
      }
    }
    if (s.art === 'weg' && pts.length > 6) {
      const gl = [], gr = [];
      for (let i = 0; i < pts.length; i++) {
        const g = breite * (0.08 + 0.05 * rausch(i * 0.4, ph + 1.3)), [nx, ny] = normalen[i];
        gl.push([pts[i][0] + nx * g, pts[i][1] + ny * g]); gr.push([pts[i][0] - nx * g, pts[i][1] - ny * g]);
      }
      // Grasnarbe nur im Mittelteil (an Kreuzungen ausgetreten)
      gras.addPath(flaeche(gl, gr, 2, pts.length - 3));
    }
    // 5) Brücken über Wasser
    const bruecken = [];
    let lauf = null;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const w = k.wasser[Math.floor(y) * KARTE_B + Math.floor(x)];
      if (w) { if (!lauf) lauf = [pts[Math.max(0, i - 1)]]; lauf.push([x, y]); }
      else if (lauf) { lauf.push([x, y]); bruecken.push(lauf); lauf = null; }
    }
    if (lauf) bruecken.push(lauf);
    const enden = [pts[0], pts[pts.length - 1]];
    liste.push({ s, pfad: catmull(pts), randFl, abschnitte, spuren, gras, bruecken, breite, punkte: pts, normalen, enden });
  }
  sz.strassen = { version: z.version, liste };
  return liste;
}

function belagMuster(sz, ctx, art) {
  if (!sz.muster) sz.muster = {};
  if (!sz.muster[art]) {
    const m = ctx.createPattern(strassenBelag(art), 'repeat');
    m.setTransform(new DOMMatrix([1 / 64, 0, 0, 1 / 64, 0, 0])); // 64 Pixel Belag = 1 Kachel
    sz.muster[art] = m;
  }
  return sz.muster[art];
}

/** Zeichnet alle Wege in Lagen (abgelaufene Randzone, Belag, Grasnarbe, Spuren), damit Kreuzungen verschmelzen. */
function zeichneStrassen(sz, ctx, z, zoom) {
  const str = strassenCache(sz, z);
  const FARBE = { pflaster: '#9c9384', kies: '#a48f6c', erde: '#987c58' };
  // abgelaufenes Gras am Wegrand
  ctx.fillStyle = 'rgba(128,112,70,0.22)';
  for (const r of str) ctx.fill(r.randFl);
  for (const r of str) for (const e of r.enden) { ctx.beginPath(); ctx.arc(e[0], e[1], r.breite * 0.62, 0, 7); ctx.fill(); }
  // Belag (Flächen mit ausgefransten Rändern); Enden rund, damit Einmündungen weich verschmelzen
  for (const r of str) {
    for (const a of r.abschnitte) { ctx.fillStyle = zoom < 14 ? FARBE[a.art] : belagMuster(sz, ctx, a.art); ctx.fill(a.pfad); }
    const endArt = r.abschnitte.length ? [r.abschnitte[0].art, r.abschnitte[r.abschnitte.length - 1].art] : ['erde', 'erde'];
    r.enden.forEach((e, j) => { ctx.fillStyle = zoom < 14 ? FARBE[endArt[j]] : belagMuster(sz, ctx, endArt[j]); ctx.beginPath(); ctx.arc(e[0], e[1], r.breite * 0.46, 0, 7); ctx.fill(); });
  }
  if (zoom >= 14) {
    for (const r of str) {
      if (r.s.art === 'weg') { ctx.fillStyle = 'rgba(104,134,64,0.8)'; ctx.fill(r.gras); }
      // Fahrspuren: unterbrochen und blass, sonst wirken sie wie Schienen
      ctx.strokeStyle = r.s.art === 'weg' ? 'rgba(84,66,44,0.28)' : 'rgba(84,66,44,0.16)'; ctx.lineWidth = r.s.art === 'weg' ? 0.09 : 0.07;
      ctx.setLineDash([0.9, 0.3, 0.5, 0.4]); ctx.stroke(r.spuren); ctx.setLineDash([]);
    }
  }
  // Brücken: Bohlen, Geländer mit Pfosten (breiter als der Weg: man geht nur hier übers Wasser)
  for (const r of str) for (const b of r.bruecken) {
    const pf = new Path2D(); pf.moveTo(b[0][0], b[0][1]); for (const q of b) pf.lineTo(q[0], q[1]);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = r.breite + 0.6; ctx.save(); ctx.translate(0.12, 0.16); ctx.stroke(pf); ctx.restore();
    ctx.strokeStyle = '#3e2c1c'; ctx.lineWidth = r.breite + 0.58; ctx.stroke(pf);
    ctx.strokeStyle = '#8a6440'; ctx.lineWidth = r.breite + 0.42; ctx.setLineDash([0.13, 0.035]); ctx.stroke(pf); ctx.setLineDash([]);
    if (zoom >= 20) {
      ctx.strokeStyle = '#5a3e22'; ctx.lineWidth = 0.07;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i < b.length; i++) {
          const a = b[Math.max(0, i - 1)], c = b[Math.min(b.length - 1, i + 1)];
          let nx = -(c[1] - a[1]), ny = c[0] - a[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          const o = (r.breite / 2 + 0.25) * sd;
          if (i) ctx.lineTo(b[i][0] + nx * o, b[i][1] + ny * o); else ctx.moveTo(b[i][0] + nx * o, b[i][1] + ny * o);
          if (i % 2 === 0) { ctx.fillStyle = '#4a321c'; ctx.fillRect(b[i][0] + nx * o - 0.06, b[i][1] + ny * o - 0.06, 0.12, 0.12); }
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = 'round';
  }
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

/** Bürgerhäuser (8 Plätze) bekommen ein eigenes Bild. */
function spriteArt(g) {
  if (g.art === 'haus' && g.wohn === 8) return 'stadthaus';
  if (g.art === 'tor') return g.material === 'mauer' ? 'tor_mauer' : 'tor_palisade';
  return g.art;
}
/** Zeichenreihenfolge: Mauern unten, darüber Torhäuser, darüber alles andere (Türme sitzen auf den Knoten). */
function ebene(g) { return g.art === 'mauer' || g.art === 'palisade' ? 0 : g.art === 'tor' ? 1 : 2; }

function figur(ctx, typ, x, y, winkel, phase, aktion, s = FIGUR_GROESSE) {
  const sp = figurSprites(typ);
  ctx.drawImage(figurSchatten(), x - s / 2 + 0.04, y - s / 2 + 0.05, s, s);
  const bild = aktion >= 0 ? sp.aktion[aktion] : sp.lauf[phase & 3];
  zeichneGedreht(ctx, bild, x, y, s, s, winkel + Math.PI / 2);
}

// ── Partikel ───────────────────────────────────────────────────────────
function partikel(sz, typ, x, y, vx, vy, leben, groesse) {
  if (sz.partikel.length > 300) return;
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
    else if (w.f < 0) { w.i--; w.f = 1; if (w.i < 0) { if (w.zuzug) { w.weg = true; continue; } w.i = 0; w.f = 0; w.dir = 1; w.warte = Math.random() * 2; } }
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
      const a = e.vonEinheit !== undefined ? { x: e.ax, y: e.ay } : z.gebaeude[e.von];
      sz.pfeile.push({ ax: a.x / 1000, ay: a.y / 1000, bx: e.x / 1000, by: e.y / 1000, t: 0 });
    } else if (e.typ === 'baum') {
      const x = (e.kachel % KARTE_B) + 0.5, y = Math.floor(e.kachel / KARTE_B) + 0.5;
      sz.anims.push({ typ: 'baumfall', x, y, t: 0, leben: 1.4, nadel: sz.nadel[e.kachel], w: Math.random() * 6.28 });
      for (let i = 0; i < 8; i++) partikel(sz, 'span', x, y, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0.8, 0.04);
    } else if (e.typ === 'tot') {
      sz.anims.push({ typ: 'tot', art: e.art, x: e.x / 1000, y: e.y / 1000, w: (e.blick || 0) * RAD, t: 0, leben: 6 });
    } else if (e.typ === 'zuzug') {
      // Zuzügler vom Kartenrand entlang der Handelsstraße
      // WARUM entlang der Straße: Quer übers Land liefen sie durch Häuser und den Fluss.
      const str = strassenCache(sz, z).filter((r) => r.s.art === 'haupt' && r.s.id < 2);
      for (let i = 0; i < e.n && str.length; i++) {
        const r = str[i % str.length], n = r.s.punkte.length / 2;
        sz.passanten.push({ r, i: n - 2, f: 1 - i * 0.04, dir: -1, v: 1.0, typ: i % 2 ? 'buergerin' : 'traeger', seite: (Math.random() - 0.5) * 0.4, phase: 0, x: 0, y: 0, w: 0, warte: 0, zuzug: true });
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
  zeichneGelaende(ctx, sz.gr, kam, 1);
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

  // Straßen (Belag, Ränder, Spuren, Brücken)
  zeichneStrassen(sz, ctx, z, zoom);

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

  // Bäume, Gras, Blumen: vorgezeichnete Chunks (render/deko.js)
  sz.dekoBaeume = zeichneDeko(ctx, sz.deko, z, c, k, sz.nadel, kam, saison, 2);

  // Brennende Gebäude bestimmen (Räuber plündern)
  for (const u of z.einheiten) if (u.art === 'raeuber' && u.zustand === 'pluendern' && u.ziel >= 0) sz.brennt.set(u.ziel, sz.zeit + 4);

  // Hausgärten hinter den Wohnhäusern (nur Optik, nur wo Platz ist)
  if (zoom >= 16) zeichneGaerten(ctx, z, c, k, v, saison);

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
  gl.sort((a, b) => ebene(a) - ebene(b) || a.id - b.id);
  for (const g of gl) {
    if (g.art === 'platz') continue;
    const sp = gebaeudeSprite(spriteArt(g), g.variante, g.b, g.t, winter);
    ctx.globalAlpha = g.zustand === 'bau' ? 0.12 : 0.3;
    zeichneGedreht(ctx, sp.schatten, g.x / 1000 + sOff * (GEBAEUDE[g.art].mauer ? 0.6 : 1.4), g.y / 1000 + sOff * (GEBAEUDE[g.art].mauer ? 0.8 : 1.8), g.b / 1000, g.t / 1000, g.w * RAD);
  }
  ctx.globalAlpha = 1;
  for (const g of gl) {
    const sp = gebaeudeSprite(spriteArt(g), g.variante, g.b, g.t, winter);
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
      // Mauerknoten: Pfeiler an den Enden schließen Ecken und zeigen die Rasterpunkte im Bild
      if (g.art === 'mauer' || g.art === 'palisade') {
        const e = mauerEnden(g), stein = g.art === 'mauer';
        for (let i = 0; i < 4; i += 2) {
          ctx.fillStyle = stein ? '#8e897e' : '#4a3018'; ctx.beginPath(); ctx.arc(e[i] / 1000, e[i + 1] / 1000, gt * 0.62, 0, 7); ctx.fill();
          ctx.fillStyle = stein ? '#bdb6a6' : '#9a6e42'; ctx.beginPath(); ctx.arc(e[i] / 1000, e[i + 1] / 1000, gt * 0.45, 0, 7); ctx.fill();
        }
      }
      if (g.hp < g.hpMax && zoom > 14 && !GEBAEUDE[g.art].begehbar) {
        const f = g.hp / g.hpMax;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(gx - 0.5, gy - gt / 2 - 0.35, 1, 0.12);
        ctx.fillStyle = f > 0.5 ? '#8c3' : '#d43'; ctx.fillRect(gx - 0.5, gy - gt / 2 - 0.35, f, 0.12);
      }
    }
    // Rauch aus Kaminen
    if (g.zustand === 'fertig' && zoom >= 16 && sp.kamine.length) {
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

  const bs = baeume();

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
    // Markttreiben: Händler an den Ständen, Käufer schlendern über den Platz
    marktTreiben(sz, z, ctx, v, dt);
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
    const kampf = kampfwerte(u);
    const schlag = u.cd > kampf.takt - 4 ? 1 : -1;
    const typ = u.art === 'soldat' ? (u.typ === 'bogen' ? 'bogner' : 'soldat') : 'raeuber';
    if (ui.einheiten && ui.einheiten.has(u.id)) {
      ctx.strokeStyle = '#7cf07c'; ctx.lineWidth = Math.max(0.05, 1.5 / zoom);
      ctx.beginPath(); ctx.ellipse(x, y + 0.08, 0.36, 0.28, 0, 0, 7); ctx.stroke();
      if (u.befehl && u.befehl.typ === 'gehe' && zoom > 12) { ctx.fillStyle = 'rgba(124,240,124,0.5)'; ctx.beginPath(); ctx.arc(u.befehl.x / 1000, u.befehl.y / 1000, 0.1, 0, 7); ctx.fill(); }
    }
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

  // Angriffs-Marker: rote Nadel über jeder Räuberbande und über geplünderten Gebäuden
  const marker = [];
  // je Trupp (Räuber, die nah beieinander gehen) eine Nadel — eine geteilte Bande bekommt zwei
  const trupps = [];
  for (const u of z.einheiten) {
    if (u.art !== 'raeuber' || u.hp <= 0) continue;
    const x = u.x / 1000, y = u.y / 1000;
    const t = trupps.find((q) => Math.hypot(q.sx / q.n - x, q.sy / q.n - y) < 5);
    if (t) { t.sx += x; t.sy += y; t.n++; } else trupps.push({ sx: x, sy: y, n: 1 });
  }
  for (const t of trupps) marker.push({ x: t.sx / t.n, y: t.sy / t.n, gross: true, n: t.n });
  for (const [id, bis] of sz.brennt) {
    const g = z.gebaeude[id];
    if (bis > sz.zeit && g && g.zustand !== 'weg') marker.push({ x: g.x / 1000, y: g.y / 1000, gross: false });
  }
  const aussen = [];
  for (const m of marker) {
    if (m.x < v.x0 + 2.5 || m.x > v.x1 - 2.5 || m.y < v.y0 + 2.5 || m.y > v.y1 - 2.5) { if (m.gross) aussen.push(m); continue; }
    angriffsMarker(ctx, m.x, m.y, zoom, sz.zeit, m.gross);
  }

  // Herrschaftsgrenze
  const burg = z.gebaeude[z.herren[0].burg];
  ctx.strokeStyle = ui.werkzeug ? 'rgba(240,210,120,0.75)' : 'rgba(240,210,120,0.3)'; ctx.lineWidth = Math.max(0.08, 2 / zoom);
  ctx.setLineDash([0.8, 0.5]);
  ctx.beginPath(); ctx.arc(burg.x / 1000, burg.y / 1000, LAND_RADIUS, 0, 7); ctx.stroke(); ctx.setLineDash([]);

  // Auswahlrahmen (Einheiten)
  if (ui.rahmen) {
    const r = ui.rahmen;
    ctx.fillStyle = 'rgba(124,240,124,0.12)'; ctx.strokeStyle = 'rgba(124,240,124,0.9)'; ctx.lineWidth = Math.max(0.04, 1 / zoom);
    ctx.fillRect(Math.min(r.ax, r.bx), Math.min(r.ay, r.by), Math.abs(r.bx - r.ax), Math.abs(r.by - r.ay));
    ctx.strokeRect(Math.min(r.ax, r.bx), Math.min(r.ay, r.by), Math.abs(r.bx - r.ax), Math.abs(r.by - r.ay));
  }
  if (ui.befehlsZiel && sz.zeit - ui.befehlsZiel.t < 0.8) {
    const f = (sz.zeit - ui.befehlsZiel.t) / 0.8;
    ctx.strokeStyle = ui.befehlsZiel.angriff ? `rgba(240,80,60,${1 - f})` : ui.befehlsZiel.mauer ? `rgba(120,180,255,${1 - f})` : `rgba(124,240,124,${1 - f})`; ctx.lineWidth = Math.max(0.06, 2 / zoom);
    ctx.beginPath(); ctx.arc(ui.befehlsZiel.x, ui.befehlsZiel.y, 0.3 + f * 0.6, 0, 7); ctx.stroke();
  }
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
  // Banden außerhalb des Bildes: roter Pfeil am Rand zeigt die Richtung
  for (const m of aussen) {
    const sx = kam.b / 2 + (m.x - kam.x) * zoom, sy = kam.h / 2 + (m.y - kam.y) * zoom;
    const dx = sx - kam.b / 2, dy = sy - kam.h / 2, f = Math.min((kam.b / 2 - 40) / Math.abs(dx || 1e-6), (kam.h / 2 - 40) / Math.abs(dy || 1e-6));
    // nicht unter die Seitenleisten (ui.rand: von main.js gemessen)
    const rr = ui.rand || { r: 0, o: 0, l: 0 };
    const px = Math.max(rr.l + 30, Math.min(kam.b - rr.r - 30, kam.b / 2 + dx * f)), py = Math.max(rr.o + 30, Math.min(kam.h - 30, kam.h / 2 + dy * f));
    const a = Math.atan2(dy, dx), puls = 0.75 + 0.25 * Math.sin(sz.zeit * 6);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = `rgba(200,30,24,${puls})`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (winter) {
    while (sz.schnee.length < 160) sz.schnee.push({ x: Math.random() * kam.b, y: Math.random() * kam.h, v: 20 + Math.random() * 40, r: 1 + Math.random() * 1.8 });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const s of sz.schnee) {
      s.y += s.v * dtEcht; s.x += Math.sin(sz.zeit + s.v) * 12 * dtEcht;
      if (s.y > kam.h) { s.y = -4; s.x = Math.random() * kam.b; }
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
  } else sz.schnee.length = 0;

  sz.stat = { ms: Math.round((performance.now() - t0) * 10) / 10, baeume: sz.dekoBaeume, partikel: sz.partikel.length, passanten: sz.passanten.length, gebaeude: gl.length };
}

/** Rote Nadel mit Ausrufezeichen und pulsierendem Ring; Größe in Bildpunkten (auch weit herausgezoomt sichtbar). */
function angriffsMarker(ctx, x, y, zoom, zeit, gross) {
  const s = (gross ? 15 : 9) / zoom, ph = (zeit * 1.2) % 1;
  ctx.strokeStyle = `rgba(220,40,30,${0.8 * (1 - ph)})`; ctx.lineWidth = 3 / zoom;
  ctx.beginPath(); ctx.arc(x, y, s * (1 + ph * 2.2), 0, 7); ctx.stroke();
  if (!gross) { ctx.fillStyle = 'rgba(220,40,30,0.85)'; ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, 7); ctx.fill(); return; }
  const ky = y - s * 2.2;
  ctx.strokeStyle = '#5a1410'; ctx.lineWidth = 2.5 / zoom; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, ky); ctx.stroke();
  ctx.fillStyle = '#d0281e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / zoom;
  ctx.beginPath(); ctx.arc(x, ky, s, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(x - s * 0.13, ky - s * 0.62, s * 0.26, s * 0.75); ctx.fillRect(x - s * 0.13, ky + s * 0.28, s * 0.26, s * 0.26);
}

/** Gemüsegärten mit Zaun hinter Häusern: macht Wohngassen lebendig. */
function zeichneGaerten(ctx, z, c, k, v, saison) {
  for (const g of z.gebaeude) {
    if (g.art !== 'haus' || g.zustand !== 'fertig') continue;
    const gx = g.x / 1000, gy = g.y / 1000;
    if (!sichtbar(v, gx, gy, 3)) continue;
    const cw = Math.cos(g.w * RAD), sw = Math.sin(g.w * RAD);
    const tiefe = g.wohn === 8 ? 0.7 : 1.0, lv = g.t / 2000 + 0.08 + tiefe / 2;
    const mx = gx - sw * lv, my = gy + cw * lv;
    const t = Math.floor(my) * KARTE_B + Math.floor(mx);
    if (k.wasser[t] || c.strasse[t] || (c.belegt[t] && c.belegt[t] - 1 !== g.id) || c.feld[t]) continue;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(g.w * RAD);
    const b = g.b / 1000 * 0.92;
    ctx.fillStyle = saison === 3 ? 'rgba(120,108,90,0.6)' : 'rgba(112,86,56,0.75)'; ctx.fillRect(-b / 2, -tiefe / 2, b, tiefe);
    if (saison !== 3) {
      ctx.strokeStyle = saison === 2 ? 'rgba(170,140,60,0.9)' : 'rgba(84,140,60,0.9)'; ctx.lineWidth = 0.07; ctx.setLineDash([0.06, 0.05]);
      ctx.beginPath();
      for (let x = -b / 2 + 0.12; x < b / 2 - 0.05; x += 0.16) { ctx.moveTo(x, -tiefe / 2 + 0.1); ctx.lineTo(x, tiefe / 2 - 0.1); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = 'rgba(90,64,36,0.9)'; ctx.lineWidth = 0.035; ctx.setLineDash([0.12, 0.05]);
    ctx.strokeRect(-b / 2, -tiefe / 2, b, tiefe); ctx.setLineDash([]);
    ctx.restore();
  }
}

/** Nur Optik: Händler stehen an den Ständen, Käufer schlendern auf dem Platz (mehr Bewohner = mehr Trubel). */
function marktTreiben(sz, z, ctx, v, dt) {
  const platz = z.gebaeude[z.herren[0].markt];
  if (!platz || !sichtbar(v, platz.x / 1000, platz.y / 1000, 6)) return;
  const pb = platz.b / 1000, pt = platz.t / 1000, cw = Math.cos(platz.w * RAD), sw = Math.sin(platz.w * RAD);
  const welt = (lu, lv) => [platz.x / 1000 + lu * cw - lv * sw, platz.y / 1000 + lu * sw + lv * cw];
  // Händler (fest an den Ständen)
  for (const reihe of [0, 1]) for (let i = 0; i < 6; i++) {
    if (reihe === 0 && (i === 2 || i === 3)) continue;
    const lu = -pb / 2 + pb * (0.12 + i * 0.135 + 0.05), lv = reihe ? pt * 0.24 : -pt * 0.24;
    const [x, y] = welt(lu, lv);
    const zu = platz.w * RAD + (reihe ? -Math.PI / 2 : Math.PI / 2);
    figur(ctx, i % 2 ? 'marktfrau' : 'buerger', x, y, zu, 0, Math.sin(sz.zeit * 1.5 + i) > 0.85 ? 1 : -1, 0.5);
  }
  // Käufer
  const soll = Math.min(26, Math.floor(z.herren[0].bewohner / 3));
  if (!sz.markt) sz.markt = [];
  while (sz.markt.length < soll) sz.markt.push({ lu: (Math.random() - 0.5) * pb * 0.8, lv: (Math.random() - 0.5) * pt * 0.5, zu: null, typ: Math.random() < 0.5 ? 'buergerin' : 'buerger', phase: 0, warte: Math.random() * 3, w: 0 });
  if (sz.markt.length > soll) sz.markt.length = soll;
  for (const m of sz.markt) {
    if (m.warte > 0) m.warte -= dt;
    else {
      if (!m.zu) m.zu = { lu: (Math.random() - 0.5) * pb * 0.8, lv: (Math.random() < 0.5 ? -1 : 1) * pt * (0.05 + Math.random() * 0.12) };
      const dx = m.zu.lu - m.lu, dy = m.zu.lv - m.lv, d = Math.hypot(dx, dy);
      if (d < 0.1) { m.zu = null; m.warte = 1 + Math.random() * 4; }
      else { m.lu += dx / d * 0.55 * dt; m.lv += dy / d * 0.55 * dt; m.w = Math.atan2(dx * sw + dy * cw, dx * cw - dy * sw); m.phase += dt * 5; }
    }
    const [x, y] = welt(m.lu, m.lv);
    figur(ctx, m.typ, x, y, m.w, Math.floor(m.phase), -1, 0.5);
  }
}

function zeichneWerkzeug(ctx, z, ui, winter, zoom) {
  const w = ui.werkzeug;
  if (!w || !ui.maus) return;
  const mx = ui.maus.x, my = ui.maus.y;
  // Rasterpunkte (Mauerenden, Türme): hier rasten neue Mauern und Wachtürme ein
  if (ui.rasterpunkte) {
    const r = Math.max(0.22, 8 / zoom);
    for (const q of ui.rasterpunkte) {
      const an = ui.fang && ui.fang.x === q.x && ui.fang.y === q.y;
      ctx.fillStyle = an ? 'rgba(124,240,124,0.9)' : 'rgba(240,210,120,0.75)'; ctx.strokeStyle = '#2a2014'; ctx.lineWidth = Math.max(0.03, 1.5 / zoom);
      ctx.beginPath(); ctx.arc(q.x, q.y, an ? r * 1.5 : r, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
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
    const ex = ui.fang ? ui.fang.x : mx, ey = ui.fang ? ui.fang.y : my;
    ctx.strokeStyle = w.art === 'mauer' ? 'rgba(200,200,200,0.85)' : 'rgba(160,110,60,0.9)'; ctx.lineWidth = GEBAEUDE[w.art].t / 1000;
    ctx.setLineDash([0.4, 0.15]);
    ctx.beginPath(); ctx.moveTo(ui.mauerStart.x / 1000, ui.mauerStart.y / 1000); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
    const len = Math.hypot(ex - ui.mauerStart.x / 1000, ey - ui.mauerStart.y / 1000);
    ctx.fillStyle = '#f0e0b0'; ctx.font = `${14 / zoom}px sans-serif`;
    ctx.fillText(`${Math.ceil(len * 1000 / GEBAEUDE[w.art].b)} Stück`, ex + 0.4, ey - 0.4);
  } else if (w.typ === 'abriss' && ui.unterMaus >= 0) {
    const g = z.gebaeude[ui.unterMaus];
    ctx.save(); ctx.translate(g.x / 1000, g.y / 1000); ctx.rotate(g.w * RAD);
    ctx.fillStyle = 'rgba(220,40,40,0.35)'; ctx.fillRect(-g.b / 2000, -g.t / 2000, g.b / 1000, g.t / 1000);
    ctx.restore();
  }
}
