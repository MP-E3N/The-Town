/**
 * strassen.js — Straßen anlegen (aus Kachelwegen geglättete Linien).
 *
 * ZWECK:    Straße hinzufügen, Tore setzen, wo Straßen Mauern kreuzen, Gebäude anbinden.
 * SCHREIBT: z.strassen, z.version, Mauer-Art (→ 'tor')
 * REGEL:    Punkte ganzzahlig in Milli-Kacheln, flach [x0,y0,x1,y1,…].
 */

import { KARTE_B } from '../data/werte.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { abgeleitet } from './abgeleitet.js';
import { findePfad } from './pfad.js';
import { kachel, abstand, abstandStrecke, COS, SIN } from './lib.js';
import { begradigen, nurNeuerTeil } from './stadtplaner.js';

export const BREITE = { haupt: 950, gasse: 700, weg: 560 };

/** Kachelweg → geglättete Punktliste (jede 2. Kachel, dann Chaikin). */
export function punkteAusPfad(pfad, startPunkt, endPunkt) {
  const roh = [];
  if (startPunkt) roh.push(startPunkt.x, startPunkt.y);
  for (let i = 0; i < pfad.length; i++) {
    if (i % 2 === 1 && i !== pfad.length - 1) continue;
    const k = pfad[i];
    roh.push((k % KARTE_B) * 1000 + 500, Math.floor(k / KARTE_B) * 1000 + 500);
  }
  if (endPunkt) roh.push(endPunkt.x, endPunkt.y);
  return glaetten(roh);
}

/** Rohe Punktliste → ohne Doppelte, einmal nach Chaikin geglättet (Endpunkte bleiben). */
export function glaetten(roh) {
  const p = [roh[0], roh[1]];
  for (let i = 2; i < roh.length; i += 2) if (roh[i] !== p[p.length - 2] || roh[i + 1] !== p[p.length - 1]) p.push(roh[i], roh[i + 1]);
  if (p.length <= 4) return p;
  const out = [p[0], p[1]];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    out.push(Math.trunc((3 * ax + bx) / 4), Math.trunc((3 * ay + by) / 4), Math.trunc((ax + 3 * bx) / 4), Math.trunc((ay + 3 * by) / 4));
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}

export function strasseHinzufuegen(z, punkte, art) {
  if (punkte.length < 4) return null;
  const s = { id: z.strassen.length, punkte, breite: BREITE[art], art };
  z.strassen.push(s);
  // Neue Straße: offene Gassenenden dürfen erneut prüfen, ob sie jetzt anschließen können.
  for (const t of z.strassen) if (t.angeschlossen) delete t.angeschlossen;
  z.version++;
  toreSetzen(z);
  return s;
}

/**
 * Wo eine Mauer eine Straße kreuzt, entsteht ein Torhaus: das Mauerstück, das der Straße am nächsten liegt,
 * wird zum Tor (breiter, mit zwei Flankentürmen). Nachbarstücke an derselben Kreuzung bleiben Mauer —
 * der Durchgang des Torhauses überdeckt sie (siehe abgeleitet.js: Tore werden zuletzt gerastert).
 */
export function toreSetzen(z) {
  const kandidaten = [];
  for (const g of z.gebaeude) {
    if (g.zustand === 'weg' || !GEBAEUDE[g.art].mauer || g.art === 'tor') continue;
    const d = mauerKreuztStrasse(z, g);
    if (d >= 0) kandidaten.push({ g, d });
  }
  if (!kandidaten.length) return;
  kandidaten.sort((a, b) => a.d - b.d || a.g.id - b.g.id);
  let geaendert = false;
  for (const { g } of kandidaten) {
    const nahTor = z.gebaeude.some((t) => t.art === 'tor' && t.zustand !== 'weg' && abstand(t.x, t.y, g.x, g.y) < 2300);
    if (nahTor) continue;
    g.material = g.art;
    g.art = 'tor';
    g.b = Math.max(g.b, GEBAEUDE.tor.b); g.t = GEBAEUDE.tor.t;
    g.hpMax = g.material === 'mauer' ? GEBAEUDE.tor.hpStein : GEBAEUDE.tor.hp;
    g.hp = g.zustand === 'fertig' ? g.hpMax : Math.min(g.hp, g.hpMax);
    geaendert = true;
  }
  if (geaendert) z.version++;
}

/**
 * Abstand der Mauer-Mitte zur nächsten Straße, die sie QUER kreuzt (≥ 40°), sonst −1.
 * Mit laengs=true: −1 oder Abstand einer Straße, die (fast) parallel unter der Mauer verläuft.
 * WARUM der Winkel: Eine Mauer, die einen Weg entlangläuft, hat dort kein Tor — sie steht auf dem Weg.
 */
export function mauerKreuztStrasse(z, g, laengs = false) {
  const c = abgeleitet(z);
  const hl = Math.trunc(g.b / 2), cw = COS[g.w], sw = SIN[g.w];
  let best = -1;
  for (const s of c.segmente) {
    if (g.x + g.b < s.x0 || g.x - g.b > s.x1 || g.y + g.b < s.y0 || g.y - g.b > s.y1) continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, l = Math.floor(Math.sqrt(dx * dx + dy * dy)) || 1;
    const parallel = Math.abs(dx * cw + dy * sw) * 100 > l * 1024 * 77; // |cos| > 0,77 ≈ unter 40°
    if (parallel !== laengs) continue;
    for (let st = -4; st <= 4; st++) {
      const px = g.x + Math.trunc(cw * hl * st / 4 / 1024), py = g.y + Math.trunc(sw * hl * st / 4 / 1024);
      if (abstandStrecke(px, py, s.ax, s.ay, s.bx, s.by) < s.hb + (laengs ? 0 : 150)) {
        const d = abstandStrecke(g.x, g.y, s.ax, s.ay, s.bx, s.by);
        if (best < 0 || d < best) best = d;
        break;
      }
    }
  }
  return best;
}

/** Verbindet die Tür eines Gebäudes mit dem nächsten Weg, falls keiner nah ist. */
export function anbinden(z, g, tuerPunkt) {
  const c = abgeleitet(z);
  const t = kachel(tuerPunkt.x, tuerPunkt.y);
  if (c.strDist[t] <= 1) return;
  const pfad = findePfad(z, t, -1, 'bau', { zielFn: (i) => c.strasse[i] === 1, max: 20000, erlaubt: new Set([g.id]) });
  if (!pfad || pfad.length < 2) return;
  pfad.reverse();
  strasseHinzufuegen(z, begradigen(z, pfad, null, tuerPunkt), 'weg');
}
