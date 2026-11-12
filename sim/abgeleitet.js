/**
 * abgeleitet.js — Aus dem Zustand berechnete Raster (nicht gespeichert, nicht gehasht).
 *
 * ZWECK:    Straßen-, Belegt-, Mauer- und Feldraster, Straßenabstand, Eimer für Kollisionssuche, Wegcache.
 * LIEST:    z.strassen, z.gebaeude, z.felder, z.version
 * SCHREIBT: nichts am Zustand
 * REGEL:    Wird neu gebaut, sobald z.version sich ändert. Jede Änderung an Straßen/Gebäuden/Feldern
 *           muss z.version++ machen. Rein deterministisch aus dem Zustand → im Netz überall gleich.
 */

import { KARTE_B, KARTE_H } from '../data/werte.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { ecken, punktIn, kachel, lokal, abstandStrecke, COS, SIN } from './lib.js';
import { karteFuer } from './karte.js';

export const EIMER = 8;
const EB = Math.ceil(KARTE_B / EIMER), EH = Math.ceil(KARTE_H / EIMER);
const caches = new WeakMap();

export function abgeleitet(z) {
  const c = caches.get(z);
  if (c && c.version === z.version) return c;
  const n = baue(z);
  caches.set(z, n);
  return n;
}

function inEimer(eimer, o, eintrag) {
  const e = ecken(o);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, e[i]); x1 = Math.max(x1, e[i]); y0 = Math.min(y0, e[i + 1]); y1 = Math.max(y1, e[i + 1]); }
  const ex0 = Math.max(0, Math.floor(x0 / 1000 / EIMER)), ex1 = Math.min(EB - 1, Math.floor(x1 / 1000 / EIMER));
  const ey0 = Math.max(0, Math.floor(y0 / 1000 / EIMER)), ey1 = Math.min(EH - 1, Math.floor(y1 / 1000 / EIMER));
  for (let ey = ey0; ey <= ey1; ey++) for (let ex = ex0; ex <= ex1; ex++) eimer[ey * EB + ex].push(eintrag);
  return { x0, y0, x1, y1 };
}

/** Markiert Kacheln, deren Mitte im Rechteck liegt (mindestens die Mittelkachel). */
function rastereObb(arr, o, wert) {
  const e = ecken(o);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, e[i]); x1 = Math.max(x1, e[i]); y0 = Math.min(y0, e[i + 1]); y1 = Math.max(y1, e[i + 1]); }
  const tx0 = Math.max(0, Math.floor(x0 / 1000)), tx1 = Math.min(KARTE_B - 1, Math.floor(x1 / 1000));
  const ty0 = Math.max(0, Math.floor(y0 / 1000)), ty1 = Math.min(KARTE_H - 1, Math.floor(y1 / 1000));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (punktIn(o, tx * 1000 + 500, ty * 1000 + 500, 0)) arr[ty * KARTE_B + tx] = wert;
  }
  const k = kachel(o.x, o.y);
  if (k >= 0 && k < arr.length) arr[k] = wert;
}

function baue(z) {
  const N = KARTE_B * KARTE_H;
  const strasse = new Uint8Array(N), belegt = new Int32Array(N), mauer = new Int32Array(N), feld = new Int32Array(N);
  const eimer = []; for (let i = 0; i < EB * EH; i++) eimer.push([]);
  const segmente = [];
  for (const s of z.strassen) {
    const p = s.punkte, hb = s.breite / 2;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      segmente.push({ ax, ay, bx, by, hb, x0: Math.min(ax, bx) - hb, x1: Math.max(ax, bx) + hb, y0: Math.min(ay, by) - hb, y1: Math.max(ay, by) + hb, strasse: s.id });
      const dx = bx - ax, dy = by - ay, len = Math.floor(Math.sqrt(dx * dx + dy * dy));
      const schritte = Math.max(1, Math.ceil(len / 250));
      const nx = len ? Math.trunc(-dy * (hb - 120) / len) : 0, ny = len ? Math.trunc(dx * (hb - 120) / len) : 0;
      for (let k = 0; k <= schritte; k++) {
        const qx = ax + Math.trunc(dx * k / schritte), qy = ay + Math.trunc(dy * k / schritte);
        for (const [ox, oy] of [[0, 0], [nx, ny], [-nx, -ny]]) {
          const tx = Math.floor((qx + ox) / 1000), ty = Math.floor((qy + oy) / 1000);
          if (tx >= 0 && ty >= 0 && tx < KARTE_B && ty < KARTE_H) strasse[ty * KARTE_B + tx] = 1;
        }
      }
    }
  }
  for (const g of z.gebaeude) {
    if (g.zustand === 'weg') continue;
    const typ = GEBAEUDE[g.art];
    if (typ.mauer) {
      // WARUM Tore zuletzt: Der Durchgang des Torhauses muss über benachbarten Mauerstücken liegen.
      if (g.zustand === 'fertig' && !typ.tor) mauerRastern(mauer, g);
    } else if (!typ.begehbar) {
      rastereObb(belegt, g, g.id + 1);
    }
    inEimer(eimer, g, { typ: 'g', id: g.id });
  }
  for (const g of z.gebaeude) if (g.art === 'tor' && g.zustand === 'fertig') mauerRastern(mauer, g);
  for (const f of z.felder) {
    if (f.weg) continue;
    rastereObb(feld, f, f.id + 1);
    inEimer(eimer, f, { typ: 'f', id: f.id });
  }
  // Begehbarkeit für Fußgänger und Soldaten (geh: 1 = Gebäude, 2 = Burghof/Tordurchgang) und Brücken.
  const geh = new Uint8Array(N), bruecke = new Uint8Array(N);
  for (const g of z.gebaeude) {
    if (g.zustand === 'weg') continue;
    const typ = GEBAEUDE[g.art];
    if (typ.tor && g.zustand === 'fertig') {
      // Flankentürme des Torhauses sind massiv; nur der Durchgang in der Mitte ist offen.
      for (const sd of [-1, 1]) {
        const p = lokal(g, sd * (Math.trunc(g.b / 2) - 450), 0), i = kachel(p.x, p.y);
        if (i >= 0 && i < N && !strasse[i]) geh[i] = 1;
      }
    }
    if (typ.mauer || typ.begehbar) continue;
    if (g.art === 'burg') burgRastern(geh, g, strasse);
    else sperreRastern(geh, g, strasse);
  }
  const k = karteFuer(z.seed);
  for (const s of segmente) {
    // WARUM eigener Brückentest: Das Straßenraster ist seitlich großzügig; über Wasser darf man nur dort
    // gehen, wo wirklich die Brücke liegt (sonst laufen Figuren neben der Brücke durchs Wasser).
    const tx0 = Math.max(0, Math.floor(s.x0 / 1000)), tx1 = Math.min(KARTE_B - 1, Math.floor(s.x1 / 1000));
    const ty0 = Math.max(0, Math.floor(s.y0 / 1000)), ty1 = Math.min(KARTE_H - 1, Math.floor(s.y1 / 1000));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * KARTE_B + tx;
      if (!k.wasser[i] || bruecke[i]) continue;
      if (abstandStrecke(tx * 1000 + 500, ty * 1000 + 500, s.ax, s.ay, s.bx, s.by) <= s.hb + 300) bruecke[i] = 1;
    }
  }
  // Abstand zur nächsten Straße (Kacheln, Schachbrett-Abstand), gedeckelt bei 8.
  const strDist = new Uint8Array(N).fill(255);
  let rand = [];
  for (let i = 0; i < N; i++) if (strasse[i]) { strDist[i] = 0; rand.push(i); }
  for (let d = 1; d <= 8 && rand.length; d++) {
    const neu = [];
    for (const i of rand) {
      const x = i % KARTE_B, y = (i - x) / KARTE_B;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= KARTE_B || ny >= KARTE_H) continue;
        const j = ny * KARTE_B + nx;
        if (strDist[j] > d) { strDist[j] = d; neu.push(j); }
      }
    }
    rand = neu;
  }
  return { version: z.version, strasse, belegt, mauer, feld, eimer, segmente, strDist, geh, bruecke, wege: new Map() };
}

/** Mauern sind dünn: entlang der Mittellinie abtasten. */
function mauerRastern(mauer, g) {
  const e = ecken({ x: g.x, y: g.y, b: g.b, t: 0, w: g.w });
  const ax = e[0], ay = e[1], bx = e[2], by = e[3];
  const sch = Math.ceil(g.b / 200);
  for (let k = 0; k <= sch; k++) {
    const qx = ax + Math.trunc((bx - ax) * k / sch), qy = ay + Math.trunc((by - ay) * k / sch);
    const tx = Math.floor(qx / 1000), ty = Math.floor(qy / 1000);
    if (tx >= 0 && ty >= 0 && tx < KARTE_B && ty < KARTE_H) mauer[ty * KARTE_B + tx] = g.id + 1;
  }
}

/**
 * Gebäude sperren für Fußgänger jede Kachel, in die sie spürbar hineinragen (9 Probepunkte), nicht nur die,
 * deren Mitte drinliegt. Straßenkacheln nur bei getroffener Mitte — sonst wären Gassen zwischen Häuserzeilen zu.
 */
function sperreRastern(geh, o, strasse) {
  const e = ecken(o);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, e[i]); x1 = Math.max(x1, e[i]); y0 = Math.min(y0, e[i + 1]); y1 = Math.max(y1, e[i + 1]); }
  const tx0 = Math.max(0, Math.floor(x0 / 1000)), tx1 = Math.min(KARTE_B - 1, Math.floor(x1 / 1000));
  const ty0 = Math.max(0, Math.floor(y0 / 1000)), ty1 = Math.min(KARTE_H - 1, Math.floor(y1 / 1000));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * KARTE_B + tx, cx = tx * 1000 + 500, cy = ty * 1000 + 500;
    let drin = punktIn(o, cx, cy, 0);
    if (!drin && !strasse[i]) {
      for (let s = 0; s < 8 && !drin; s++) drin = punktIn(o, cx + PROBE[s * 2], cy + PROBE[s * 2 + 1], 0);
    }
    if (drin) geh[i] = 1;
  }
  const k = kachel(o.x, o.y);
  if (k >= 0 && k < geh.length) geh[k] = 1;
}
const PROBE = [-350, -350, 0, -350, 350, -350, -350, 0, 350, 0, -350, 350, 0, 350, 350, 350];

/** Burg: Ringmauer gesperrt, Hof begehbar (2), Zugang nur durch das Torhaus vorne (lokal −v). */
function burgRastern(geh, g, strasse) {
  sperreRastern(geh, g, strasse);
  const e = ecken(g);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, e[i]); x1 = Math.max(x1, e[i]); y0 = Math.min(y0, e[i + 1]); y1 = Math.max(y1, e[i + 1]); }
  const c = COS[g.w], s = SIN[g.w], innenB = g.b / 2 - 1100, innenT = g.t / 2 - 1100;
  for (let ty = Math.max(0, Math.floor(y0 / 1000)); ty <= Math.min(KARTE_H - 1, Math.floor(y1 / 1000)); ty++) {
    for (let tx = Math.max(0, Math.floor(x0 / 1000)); tx <= Math.min(KARTE_B - 1, Math.floor(x1 / 1000)); tx++) {
      const dx = tx * 1000 + 500 - g.x, dy = ty * 1000 + 500 - g.y;
      const lu = Math.trunc((dx * c + dy * s) / 1024), lv = Math.trunc((-dx * s + dy * c) / 1024);
      if (Math.abs(lu) <= innenB && Math.abs(lv) <= innenT) geh[ty * KARTE_B + tx] = 2;
    }
  }
  // Tordurchgang: vom Hof gerade hinaus vor das Tor, ohne Diagonalsprünge (Ecken schneiden ist verboten)
  const a = lokal(g, 0, -g.t / 2 + 1600), b = lokal(g, 0, -(Math.floor(g.t / 2) + 450));
  let vor = -1;
  for (let st = 0; st <= 30; st++) {
    const x = a.x + Math.trunc((b.x - a.x) * st / 30), y = a.y + Math.trunc((b.y - a.y) * st / 30);
    const i = kachel(x, y);
    if (i < 0 || i >= geh.length || i === vor) continue;
    if (vor >= 0 && i % KARTE_B !== vor % KARTE_B && Math.floor(i / KARTE_B) !== Math.floor(vor / KARTE_B)) {
      geh[Math.floor(vor / KARTE_B) * KARTE_B + (i % KARTE_B)] = 2;
    }
    geh[i] = 2; vor = i;
  }
}

/** Alle Objekte (Gebäude/Felder) in den Eimern um ein Rechteck. */
export function objekteNahe(c, x0, y0, x1, y1) {
  const ex0 = Math.max(0, Math.floor(x0 / 1000 / EIMER)), ex1 = Math.min(EB - 1, Math.floor(x1 / 1000 / EIMER));
  const ey0 = Math.max(0, Math.floor(y0 / 1000 / EIMER)), ey1 = Math.min(EH - 1, Math.floor(y1 / 1000 / EIMER));
  const gesehen = new Set(), out = [];
  for (let ey = ey0; ey <= ey1; ey++) for (let ex = ex0; ex <= ex1; ex++) {
    for (const e of c.eimer[ey * EB + ex]) {
      const key = e.typ + e.id;
      if (gesehen.has(key)) continue;
      gesehen.add(key); out.push(e);
    }
  }
  return out;
}
