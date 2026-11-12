/**
 * stadtplaner.js — Wie ein mittelalterlicher Lokator Straßen legt (siehe .claude/skills/stadtplaner).
 *
 * ZWECK:    1) Wege begradigen: aus einem Kachelweg (A*) gerade Strecken machen, wo das Gelände es zulässt,
 *              Ecken als sanfte Bögen — keine „Würmer“.
 *           2) Wohngassen: zweigen im rechten Winkel (T-Kreuzung) von bestehenden Straßen ab, laufen gerade
 *              oder an der Höhenlinie entlang, halten Blocktiefe zur Nachbargasse, enden an einer anderen
 *              Straße (Schleife) oder am Rand des Wohnlands — nie mitten im Nichts.
 *           3) Plätze am Marktplatz: Bürgerhäuser mit der Front zum Platz.
 * LIEST:    Karte, abgeleitete Raster, z.zone
 * SCHREIBT: nichts direkt außer über strasseHinzufuegen (planeWohngasse)
 * REGEL:    Deterministisch, ganzzahlig. Gelände lesen = Höhenunterschied je Kachel (k.hoehe) prüfen:
 *           ≤ 30 je 0,4 Kacheln entlang des Wegs, sonst biegt der Weg ab (folgt der Höhenlinie).
 * DEBUG:    spiel.z.herren[0].planLog
 */

import { KARTE_B, KARTE_H } from '../data/werte.js';
import { karteFuer } from './karte.js';
import { abgeleitet } from './abgeleitet.js';
import { kachel, abstand, winkelVon, wnorm, COS, SIN } from './lib.js';

const BLOCK = 2; // Mindestabstand (Kacheln, Schachbrett) einer neuen Gasse zu Nachbarstraßen → Blocktiefe ≈ 2 Hausreihen

/** Ist die gerade Strecke a→b befahrbar? (Wasser nur, wo der Originalweg auch über Wasser ging = Brücke) */
function streckeOk(z, k, c, ax, ay, bx, by, aufPfad) {
  const d = abstand(ax, ay, bx, by), n = Math.max(1, Math.ceil(d / 400));
  let hVor = k.hoehe[kachel(ax, ay)];
  for (let s = 1; s <= n; s++) {
    const x = ax + Math.trunc((bx - ax) * s / n), y = ay + Math.trunc((by - ay) * s / n);
    const t = kachel(x, y);
    if (!aufPfad.has(t)) {
      if (k.wasser[t] && !c.strasse[t]) return false;
      if (c.feld[t] || c.mauer[t]) return false;
      if (c.belegt[t]) { const g = z.gebaeude[c.belegt[t] - 1]; if (g.art !== 'platz') return false; }
      if (k.fels[t] > 55 || k.erz[t] > 55) return false;
    }
    const hh = k.hoehe[t];
    if (Math.abs(hh - hVor) > 30) return false;
    hVor = hh;
  }
  return true;
}

/** Ecken als Bögen: je Ecke zwei Punkte kurz davor/danach plus einen Mittelpunkt. */
export function ecktenRunden(p) {
  const n = p.length / 2;
  if (n <= 2) return p.slice();
  const out = [p[0], p[1]];
  for (let i = 1; i < n - 1; i++) {
    const ax = p[i * 2 - 2], ay = p[i * 2 - 1], vx = p[i * 2], vy = p[i * 2 + 1], bx = p[i * 2 + 2], by = p[i * 2 + 3];
    const la = abstand(ax, ay, vx, vy) || 1, lb = abstand(vx, vy, bx, by) || 1;
    const d = Math.min(1400, Math.floor(la * 0.4), Math.floor(lb * 0.4));
    const q1x = vx + Math.trunc((ax - vx) * d / la), q1y = vy + Math.trunc((ay - vy) * d / la);
    const q2x = vx + Math.trunc((bx - vx) * d / lb), q2y = vy + Math.trunc((by - vy) * d / lb);
    out.push(q1x, q1y, Math.trunc((q1x + 2 * vx + q2x) / 4), Math.trunc((q1y + 2 * vy + q2y) / 4), q2x, q2y);
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}

/** Kachelweg → wenige gerade Strecken (weitest sichtbarer Punkt), dann Ecken runden. */
export function begradigen(z, pfad, start, ende) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  const pts = pfad.map((t) => [(t % KARTE_B) * 1000 + 500, Math.floor(t / KARTE_B) * 1000 + 500]);
  if (start) pts.unshift([start.x, start.y]);
  if (ende) pts.push([ende.x, ende.y]);
  if (pts.length < 2) return pts.flat();
  const aufPfad = new Set(pfad);
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !streckeOk(z, k, c, pts[i][0], pts[i][1], pts[j][0], pts[j][1], aufPfad)) j--;
    out.push(pts[j]); i = j;
  }
  return ecktenRunden(out.flat());
}

function frei(z, k, c, t) {
  return !k.wasser[t] && !c.belegt[t] && !c.feld[t] && !c.mauer[t] && !c.strasse[t] && k.fels[t] <= 55 && k.erz[t] <= 55;
}

/** Verfolgt eine neue Gasse ab P in Richtung w. Liefert {pts, verbunden, knicke, front} oder null. */
function gasseVerfolgen(z, k, c, px, py, w, zone) {
  const pts = [px, py];
  let cx = px, cy = py, dir = w, knicke = 0, verbunden = false, schritte = 0, neu = 0;
  for (let s = 1; s <= 16; s++) {
    let weiter = false;
    for (const dw of [0, -12, 12, -24, 24]) {
      const ww = wnorm(dir + dw);
      const nx = cx + Math.trunc(COS[ww] * 1000 / 1024), ny = cy + Math.trunc(SIN[ww] * 1000 / 1024);
      const tx = Math.floor(nx / 1000), ty = Math.floor(ny / 1000);
      if (tx < 1 || ty < 1 || tx >= KARTE_B - 1 || ty >= KARTE_H - 1) continue;
      const t = ty * KARTE_B + tx;
      if (Math.abs(k.hoehe[t] - k.hoehe[kachel(cx, cy)]) > 45) continue; // zu steil → Höhenlinie suchen
      if (s >= 4 && c.strasse[t]) { pts.push(nx, ny); verbunden = true; weiter = false; cx = nx; cy = ny; dir = ww; schritte = s; break; }
      if (!c.strasse[t] && !frei(z, k, c, t)) continue;
      if (s >= 4 && c.strDist[t] <= BLOCK) {
        // nahe an einer anderen Straße: dorthin verbinden statt parallel zu laufen
        if (c.strDist[t] <= 1) { pts.push(nx, ny); verbunden = true; cx = nx; cy = ny; dir = ww; schritte = s; break; }
        continue;
      }
      if (z.zone[t] !== zone && s > 2) continue;
      if (dw) knicke++;
      if (!c.strasse[t]) neu++;
      cx = nx; cy = ny; dir = ww; schritte = s; weiter = true;
      if (s % 2 === 0 || dw) pts.push(nx, ny);
      break;
    }
    if (verbunden || !weiter) break;
  }
  if (pts[pts.length - 2] !== cx || pts[pts.length - 1] !== cy) pts.push(cx, cy);
  if (!verbunden && schritte < 5) return null;
  if (verbunden && schritte < 4) return null;
  // WARUM: Eine Gasse, die nur auf vorhandener Straße liegt, wäre doppelt.
  if (neu < 3) return null;
  // Bebaubare Front: freie Zonen-Kacheln 1–3 Kacheln seitlich der Gasse
  let front = 0;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const qx = pts[i], qy = pts[i + 1];
    for (const sd of [-1, 1]) for (const d of [1500, 2500]) {
      const t = kachel(qx + Math.trunc(-SIN[dir] * sd * d / 1024), qy + Math.trunc(COS[dir] * sd * d / 1024));
      if (t >= 0 && t < z.zone.length && z.zone[t] === zone && frei(z, k, c, t)) front++;
    }
  }
  return { pts, verbunden, knicke, front, schritte };
}

/**
 * Neue Wohngasse: T-Abzweig von einer bestehenden Straße in das Wohnland.
 * Bewertung: bebaubare Front, Anschluss an eine andere Straße (Schleife), Nähe zum Markt, wenig Knicke.
 */
export function planeWohngasse(z, herr, zone, markt) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  let best = null, bw = -Infinity;
  for (const s of z.strassen) {
    const p = s.punkte;
    let laufend = 0, naechster = 1200;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const len = abstand(ax, ay, bx, by);
      if (!len) continue;
      const w = winkelVon(bx - ax, by - ay);
      while (naechster <= laufend + len) {
        const tt = naechster - laufend;
        naechster += 1500;
        const px = ax + Math.trunc((bx - ax) * tt / len), py = ay + Math.trunc((by - ay) * tt / len);
        const tx = Math.floor(px / 1000), ty = Math.floor(py / 1000);
        let nahe = false;
        for (let dy = -3; dy <= 3 && !nahe; dy++) for (let dx = -3; dx <= 3; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x >= 0 && y >= 0 && x < KARTE_B && y < KARTE_H && z.zone[y * KARTE_B + x] === zone) { nahe = true; break; }
        }
        if (!nahe) continue;
        for (const seite of [1, -1]) {
          const g = gasseVerfolgen(z, k, c, px, py, wnorm(w + seite * 90), zone);
          if (!g) continue;
          const wert = g.front * 10 + (g.verbunden ? 30 : 0) - Math.floor(abstand(px, py, markt.x, markt.y) / 500) - g.knicke * 4 - (s.art === 'weg' ? 15 : 0);
          if (g.front >= 6 && wert > bw) { bw = wert; best = g; }
        }
      }
      laufend += len;
    }
  }
  return best ? { punkte: ecktenRunden(best.pts), verbunden: best.verbunden } : null;
}

/** Bauplätze rund um den Marktplatz, Front zum Platz (für Bürgerhäuser). */
export function platzRandPlaetze(z, platz, b, t) {
  const out = [];
  const seiten = [
    { lu0: -platz.b / 2, lv: -platz.t / 2, laenge: platz.b, nw: 270 }, // vordere Längsseite (lokal -v)
    { lu0: -platz.b / 2, lv: platz.t / 2, laenge: platz.b, nw: 90 },
  ];
  for (const sd of seiten) {
    const normale = wnorm(platz.w + sd.nw); // zeigt vom Platz weg
    for (let lu = sd.lu0 + b / 2 + 200; lu <= sd.lu0 + sd.laenge - b / 2 - 200; lu += b + 60) {
      const ax = platz.x + Math.trunc((COS[platz.w] * lu - SIN[platz.w] * sd.lv) / 1024);
      const ay = platz.y + Math.trunc((SIN[platz.w] * lu + COS[platz.w] * sd.lv) / 1024);
      const off = Math.floor(t / 2) + 160;
      const x = ax + Math.trunc(COS[normale] * off / 1024), y = ay + Math.trunc(SIN[normale] * off / 1024);
      // Front (−v) zeigt zum Platz: v = Normale → W = Normale − 90
      out.push({ x, y, w: wnorm(normale - 90), platz: true });
    }
  }
  return out;
}
