/**
 * pfad.js — Wegsuche (A*) auf dem Kachelraster.
 *
 * ZWECK:    Wege für Träger, Soldaten, Räuber und für den Straßenbau des Baumeisters.
 * LIEST:    Karte, abgeleitete Raster, z.wald, z.gebaeude (Mauer-HP)
 * REGEL:    Ganzzahlige Kosten (gerade 10, schräg 14). Keine Ecken schneiden (beide Nachbarn frei).
 *   Modi:  'buerger'  Straßen billig, Gebäude zu (außer erlaubt), Mauern zu, Tore offen
 *          'raeuber'  wie buerger, aber Mauern/Tore teuer statt zu (sie reißen sie ein)
 *          'bau'      Straßenbau: Wasser = Brücke (teuer), Felder/Gebäude zu, vorhandene Straße sehr billig
 */

import { KARTE_B, KARTE_H } from '../data/werte.js';
import { karteFuer } from './karte.js';
import { abgeleitet } from './abgeleitet.js';

const N = KARTE_B * KARTE_H;
const gKost = new Int32Array(N), vorg = new Int32Array(N), gen = new Int32Array(N), zu = new Uint8Array(N);
let generation = 1;
const heapF = [], heapI = [];

function push(f, i) {
  heapF.push(f); heapI.push(i);
  let k = heapF.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapF[p] <= heapF[k]) break;
    [heapF[p], heapF[k]] = [heapF[k], heapF[p]]; [heapI[p], heapI[k]] = [heapI[k], heapI[p]];
    k = p;
  }
}
function pop() {
  const i = heapI[0];
  const lf = heapF.pop(), li = heapI.pop();
  if (heapF.length) {
    heapF[0] = lf; heapI[0] = li;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1; let m = k;
      if (l < heapF.length && heapF[l] < heapF[m]) m = l;
      if (r < heapF.length && heapF[r] < heapF[m]) m = r;
      if (m === k) break;
      [heapF[m], heapF[k]] = [heapF[k], heapF[m]]; [heapI[m], heapI[k]] = [heapI[k], heapI[m]];
      k = m;
    }
  }
  return i;
}

/** Kosten, eine Kachel zu betreten (−1 = gesperrt). */
export function kachelKosten(z, c, k, i, modus, erlaubt) {
  const b = c.belegt[i];
  if (modus === 'bau') {
    if (b && !(erlaubt && erlaubt.has(b - 1))) return -1;
    if (c.feld[i]) return -1;
    if (c.mauer[i]) return 80;
    if (c.strasse[i]) return 4;
    if (k.wasser[i]) return 160;
    if (k.fels[i] > 50 || k.erz[i] > 50) return 90;
    return 18 + k.steil[i] + (z.wald[i] > 50 ? 10 : 0);
  }
  if (k.wasser[i] && !c.strasse[i]) return -1;
  // WARUM: Burg und Kaserne haben Höfe und Tore – eigene Leute gehen hindurch, Räuber nicht.
  if (b && modus !== 'raeuber' && hof(z, b)) return 14;
  if (b && !(erlaubt && erlaubt.has(b - 1))) return -1;
  const m = c.mauer[i];
  if (m) {
    const g = z.gebaeude[m - 1];
    if (modus === 'raeuber') return 60 + Math.floor(g.hp / 3);
    if (g.art !== 'tor') return -1;
  }
  if (c.strasse[i]) return 10;
  return 20 + (k.steil[i] >> 2) + (z.wald[i] > 50 ? 8 : 0) + (c.feld[i] ? 4 : 0);
}

function hof(z, b) { const a = z.gebaeude[b - 1].art; return a === 'burg' || a === 'kaserne'; }

/**
 * @param z Zustand  @param start Kachel  @param ziel Kachel oder −1 (dann zielFn)
 * @param modus 'buerger'|'raeuber'|'bau'  @param opt {erlaubt:Set<gebäudeId>, zielFn:(i)=>bool, max:number}
 * @returns {number[]|null} Kacheln von start bis ziel
 */
export function findePfad(z, start, ziel, modus, opt = {}) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  const erlaubt = opt.erlaubt || null, zielFn = opt.zielFn || null, max = opt.max || 40000;
  if (start < 0 || start >= N) return null;
  if (start === ziel) return [start];
  generation++;
  heapF.length = 0; heapI.length = 0;
  const zx = ziel >= 0 ? ziel % KARTE_B : 0, zy = ziel >= 0 ? Math.floor(ziel / KARTE_B) : 0;
  const h = (i) => {
    if (ziel < 0) return 0;
    const dx = Math.abs(i % KARTE_B - zx), dy = Math.abs(Math.floor(i / KARTE_B) - zy);
    const mn = Math.min(dx, dy);
    return (modus === 'bau' ? 4 : 10) * (dx + dy) - (modus === 'bau' ? 2 : 6) * mn;
  };
  gen[start] = generation; gKost[start] = 0; vorg[start] = -1; zu[start] = 0;
  push(h(start), start);
  let gefunden = -1, schritte = 0;
  while (heapF.length) {
    const i = pop();
    if (zu[i] && gen[i] === generation) continue;
    zu[i] = 1;
    if (i === ziel || (zielFn && zielFn(i))) { gefunden = i; break; }
    if (++schritte > max) break;
    const x = i % KARTE_B, y = (i - x) / KARTE_B;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= KARTE_B || ny >= KARTE_H) continue;
      const j = ny * KARTE_B + nx;
      if (gen[j] === generation && zu[j]) continue;
      let kk = (j === ziel) ? Math.max(10, kachelKosten(z, c, k, j, modus, erlaubt)) : kachelKosten(z, c, k, j, modus, erlaubt);
      if (j === ziel && kk < 0) kk = 30;
      if (kk < 0) continue;
      if (ox && oy) {
        if (kachelKosten(z, c, k, y * KARTE_B + nx, modus, erlaubt) < 0 || kachelKosten(z, c, k, ny * KARTE_B + x, modus, erlaubt) < 0) continue;
        kk = Math.floor(kk * 14 / 10);
      }
      const ng = gKost[i] + kk;
      if (gen[j] !== generation || ng < gKost[j]) {
        gen[j] = generation; zu[j] = 0; gKost[j] = ng; vorg[j] = i;
        push(ng + h(j), j);
      }
    }
  }
  if (gefunden < 0) return null;
  const pfad = [];
  for (let i = gefunden; i !== -1; i = vorg[i]) pfad.push(i);
  pfad.reverse();
  return pfad;
}

/** Pfadlänge in Milli-Kacheln. */
export function pfadLaenge(pfad) {
  let l = 0;
  for (let i = 1; i < pfad.length; i++) {
    const a = pfad[i - 1], b = pfad[i];
    l += (a % KARTE_B !== b % KARTE_B && Math.floor(a / KARTE_B) !== Math.floor(b / KARTE_B)) ? 1414 : 1000;
  }
  return l;
}

/** Gerade Linie frei begehbar? (für direktes Hinlaufen ohne A*) */
export function freieLinie(z, ax, ay, bx, by, modus) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  const dx = bx - ax, dy = by - ay, len = Math.floor(Math.sqrt(dx * dx + dy * dy));
  const n = Math.max(1, Math.ceil(len / 400));
  for (let s = 1; s <= n; s++) {
    const x = ax + Math.trunc(dx * s / n), y = ay + Math.trunc(dy * s / n);
    const tx = Math.floor(x / 1000), ty = Math.floor(y / 1000);
    if (tx < 0 || ty < 0 || tx >= KARTE_B || ty >= KARTE_H) return false;
    const i = ty * KARTE_B + tx;
    if (k.wasser[i] && !c.strasse[i]) return false;
    if (c.belegt[i] && (modus === 'raeuber' || !hof(z, c.belegt[i]))) return false;
    if (c.mauer[i] && (modus === 'raeuber' || z.gebaeude[c.mauer[i] - 1].art !== 'tor')) return false;
  }
  return true;
}

/** Weg zwischen zwei Kacheln mit Cache (gilt bis zur nächsten Zustandsversion). */
export function wegGecached(z, start, ziel, modus, erlaubt) {
  const c = abgeleitet(z);
  const key = start + '>' + ziel + modus;
  if (c.wege.has(key)) return c.wege.get(key);
  const p = findePfad(z, start, ziel, modus, { erlaubt });
  c.wege.set(key, p);
  return p;
}
