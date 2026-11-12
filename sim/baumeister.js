/**
 * baumeister.js — Der Stadtplaner des Spiels: sucht Bauplätze, legt Gassen, Höfe mit Feldern an.
 *
 * ZWECK:    Der Spieler schreibt nur Land aus (Zonen). Hier wird entschieden, WAS gebaut wird
 *           (Bedarf) und WO (entlang Straßen, Front zur Straße, leicht gedreht, gelände-geprüft).
 * LIEST:    Karte, abgeleitete Raster, z.zone, z.herren
 * SCHREIBT: z.gebaeude, z.felder, z.strassen (über strassen.js), Lager (Baukosten), z.wald (Rodung)
 * REGEL:    Deterministisch: feste Reihenfolge, Zufall nur über zufall(z, n).
 * DEBUG:    spiel.z.herren[0].planLog zeigt die letzten Entscheidungen.
 */

import { KARTE_B, KARTE_H, LAND_RADIUS, FELD } from '../data/werte.js';
import { GEBAEUDE, ZONEN } from '../data/gebaeude.js';
import { karteFuer } from './karte.js';
import { abgeleitet, objekteNahe } from './abgeleitet.js';
import { findePfad } from './pfad.js';
import { strasseHinzufuegen, glaetten, anbinden } from './strassen.js';
import { vorratReicht } from './wirtschaft.js';
import { begradigen, planeWohngasse, platzRandPlaetze, gassenEndeAnschliessen } from './stadtplaner.js';
import { geben, nehmen, leer } from './lager.js';
import { ecken, lokal, ueberlappt, abstandStrecke, abstand, kachel, winkelVon, wnorm, zufall, COS, SIN, meldung } from './lib.js';

/** Türpunkt (vor der Front, Richtung Straße). */
export function tuer(g) { return lokal(g, 0, -(Math.floor(g.t / 2) + 450)); }
export function tuerKachel(g) { const p = tuer(g); return kachel(Math.max(0, p.x), Math.max(0, p.y)); }

function probePunkte(o) {
  const e = ecken(o);
  const p = [o.x, o.y, ...e];
  for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8; p.push(Math.trunc((e[i] + e[j]) / 2), Math.trunc((e[i + 1] + e[j + 1]) / 2)); }
  return p;
}

/**
 * Ist der Platz frei? Gibt null (ok) oder einen Grund zurück.
 * opt: zone, zoneMin (Probepunkte von 9), steilMax, rand, strRand, keineStrasse(false=Straße erlaubt),
 *      braucht ('fels'|'erz'), amWasser, extra (weitere Rechtecke), mauer (Mauerstück: andere Mauern egal)
 */
export function pruefePlatz(z, herr, o, opt = {}) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  const h = z.herren[herr];
  const burg = z.gebaeude[h.burg];
  if (burg && abstand(o.x, o.y, burg.x, burg.y) > LAND_RADIUS * 1000) return 'außerhalb deines Landes';
  const pts = probePunkte(o);
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < 600 || pts[i + 1] < 600 || pts[i] > KARTE_B * 1000 - 600 || pts[i + 1] > KARTE_H * 1000 - 600) return 'Kartenrand';
  }
  let inZone = 0, hmin = 1e9, hmax = -1e9;
  for (let i = 0; i < pts.length; i += 2) {
    const t = kachel(pts[i], pts[i + 1]);
    if (k.wasser[t] && !c.strasse[t]) return 'Wasser';
    if (opt.zone && z.zone[t] === opt.zone) inZone++;
    if (k.hoehe[t] < hmin) hmin = k.hoehe[t];
    if (k.hoehe[t] > hmax) hmax = k.hoehe[t];
    if (!opt.felsOk && (k.fels[t] > 55 || k.erz[t] > 55)) return 'Fels';
  }
  if (opt.zone && inZone < (opt.zoneMin ?? 7)) return 'nicht in der Zone';
  if (hmax - hmin > (opt.steilMax ?? 45)) return 'zu steil';
  if (opt.braucht) {
    const arr = opt.braucht === 'fels' ? k.fels : k.erz;
    const tx = Math.floor(o.x / 1000), ty = Math.floor(o.y / 1000);
    let n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < KARTE_B && y < KARTE_H && arr[y * KARTE_B + x] > 40) n++;
    }
    if (n < 3) return opt.braucht === 'fels' ? 'kein Fels in der Nähe' : 'kein Erz in der Nähe';
  }
  if (opt.amWasser) {
    const tx = Math.floor(o.x / 1000), ty = Math.floor(o.y / 1000);
    let w = false;
    for (let dy = -2; dy <= 2 && !w; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < KARTE_B && y < KARTE_H && k.wasser[y * KARTE_B + x]) { w = true; break; }
    }
    if (!w) return 'kein Wasser';
  }
  const r = Math.max(o.b, o.t);
  if (opt.keineStrasse !== false) {
    const sr = opt.strRand ?? 120;
    for (const s of c.segmente) {
      if (o.x + r < s.x0 || o.x - r > s.x1 || o.y + r < s.y0 || o.y - r > s.y1) continue;
      for (let i = 0; i < pts.length; i += 2) if (abstandStrecke(pts[i], pts[i + 1], s.ax, s.ay, s.bx, s.by) < s.hb + sr) return 'Straße';
      const mx = Math.trunc((s.ax + s.bx) / 2), my = Math.trunc((s.ay + s.by) / 2);
      if (abstand(mx, my, o.x, o.y) < Math.min(o.b, o.t) / 2) return 'Straße';
    }
  }
  const rand = opt.rand ?? 250;
  for (const e of objekteNahe(c, o.x - r - 1500, o.y - r - 1500, o.x + r + 1500, o.y + r + 1500)) {
    const obj = e.typ === 'g' ? z.gebaeude[e.id] : z.felder[e.id];
    if (e.typ === 'g' && obj.zustand === 'weg') continue;
    if (opt.mauer && e.typ === 'g' && (GEBAEUDE[obj.art].mauer || obj.art === 'turm')) continue;
    if (opt.mauerOk && e.typ === 'g' && GEBAEUDE[obj.art].mauer) continue;
    if (ueberlappt(o, obj, opt.mauer ? 0 : rand)) return 'belegt';
  }
  for (const x of opt.extra || []) if (ueberlappt(o, x, rand)) return 'belegt';
  return null;
}

/** Läuft alle Straßen ab und liefert mögliche Plätze (x,y,w) im Abstand zur Straße. */
function zoneNahe(z, tx, ty, zone, r) {
  if (z.zone[ty * KARTE_B + tx] === zone) return true;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x >= 0 && y >= 0 && x < KARTE_B && y < KARTE_H && z.zone[y * KARTE_B + x] === zone) return true;
  }
  return false;
}

function strassenPlaetze(z, b, t, zone, nahe = 0, dicht = false) {
  const out = [];
  // WARUM dicht: In der Stadt stehen Häuser Wand an Wand (Zeilenbebauung), draußen mit Abstand.
  const schritt = b + (dicht ? 90 : 380);
  for (const s of z.strassen) {
    const p = s.punkte;
    let laufend = 0;
    const starts = [Math.floor(schritt / 2), schritt];
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const dx = bx - ax, dy = by - ay, len = Math.floor(Math.sqrt(dx * dx + dy * dy));
      if (len === 0) continue;
      const w = winkelVon(dx, dy);
      for (const st of starts) {
        // Positionen st + n*schritt (Bogenlänge über die ganze Straße)
        let n = Math.ceil((laufend - st) / (2 * schritt));
        if (n < 0) n = 0;
        for (let d = st + n * 2 * schritt; d < laufend + len; d += 2 * schritt) {
          if (d < laufend) continue;
          const tt = d - laufend;
          const mx = ax + Math.trunc(dx * tt / len), my = ay + Math.trunc(dy * tt / len);
          for (const seite of [1, -1]) {
            const off = Math.floor(s.breite / 2) + Math.floor(t / 2) + (dicht ? 110 : 230);
            const cx = mx + Math.trunc(-dy * off * seite / len), cy = my + Math.trunc(dx * off * seite / len);
            const tx = Math.floor(cx / 1000), ty = Math.floor(cy / 1000);
            if (tx < 0 || ty < 0 || tx >= KARTE_B || ty >= KARTE_H) continue;
            if (zone && !zoneNahe(z, tx, ty, zone, nahe)) continue;
            out.push({ x: cx, y: cy, w: wnorm(w + (seite < 0 ? 180 : 0)) });
          }
        }
      }
      laufend += len;
    }
  }
  return out;
}

/** Felder hinter einem Hof (lokale v-Achse zeigt von der Straße weg). */
function felderPlanen(z, herr, o) {
  const fb = 2700, ft = 3900, out = [];
  const r0 = Math.floor(o.t / 2) + 380 + ft / 2, r1 = r0 + ft + 300;
  const cBreit = fb / 2 + 160;
  const plaetze = [[-cBreit, r0], [cBreit, r0], [-cBreit, r1], [cBreit, r1], [-(cBreit + fb + 320), r0], [cBreit + fb + 320, r0]];
  for (const [lu, lv] of plaetze) {
    if (out.length >= 4) break;
    const p = lokal(o, lu, lv);
    const f = { x: p.x, y: p.y, b: fb, t: ft, w: wnorm(o.w + zufall(z, 9) - 4) };
    if (!pruefePlatz(z, herr, f, { zone: 2, zoneMin: 6, steilMax: 90, rand: 120, strRand: 60, extra: [o, ...out] })) out.push(f);
  }
  return out;
}

function weidePlanen(z, herr, o) {
  for (const lu of [0, -1600, 1600]) {
    const p = lokal(o, lu, Math.floor(o.t / 2) + 350 + 2300);
    const f = { x: p.x, y: p.y, b: 4800, t: 4600, w: wnorm(o.w + zufall(z, 7) - 3) };
    if (!pruefePlatz(z, herr, f, { zone: 3, zoneMin: 6, steilMax: 90, rand: 120, strRand: 60, extra: [o] })) return [f];
  }
  return [];
}

const HAUS_B = [1000, 1150, 1300], HAUS_T = [1350, 1600, 1850];
/** Bürgerhäuser nahe dem Markt: größer, mehr Bewohner. */
const STADTHAUS_B = [1150, 1300, 1450], STADTHAUS_T = [1800, 2000, 2200];
const STADTKERN = 11000;

/** Bester Platz für eine Gebäudeart in ihrer Zone, oder null. */
export function findePlatz(z, herr, art, nahe = null) {
  const typ = GEBAEUDE[art], k = karteFuer(z.seed);
  const zone = typ.zone || 0;
  const markt = nahe || z.gebaeude[z.herren[herr].markt] || z.gebaeude[z.herren[herr].burg];
  let best = null, bestWert = Infinity;
  const b0 = art === 'haus' ? 1450 : typ.b, t0 = art === 'haus' ? 2200 : typ.t;
  const plaetze = strassenPlaetze(z, b0, t0, zone, (art === 'hof' || art === 'viehhof') ? 2 : typ.braucht ? 2 : 0, art === 'haus');
  const platz = z.gebaeude[z.herren[herr].markt];
  if (art === 'haus' && platz) for (const p of platzRandPlaetze(z, platz, 1300, 2000)) plaetze.unshift(p);
  for (const p of plaetze) {
    let b = typ.b, t = typ.t, wohn = 0;
    if (art === 'haus') {
      const kern = abstand(p.x, p.y, markt.x, markt.y) < STADTKERN;
      const i = zufall(z, 3), j = zufall(z, 3);
      b = kern ? STADTHAUS_B[i] : HAUS_B[i]; t = kern ? STADTHAUS_T[j] : HAUS_T[j];
      wohn = kern ? 8 : 5;
    }
    const o = { x: p.x, y: p.y, b, t, w: wnorm(p.w + (art === 'haus' ? zufall(z, 5) - 2 : zufall(z, 9) - 4)) };
    // WARUM nachrücken: Platz wurde für die größte Hausgröße gesucht; kleinere rücken an die Straße.
    if (t < t0) { const q = lokal(o, 0, -Math.floor((t0 - t) / 2)); o.x = q.x; o.y = q.y; }
    const grund = pruefePlatz(z, herr, o, { zone, zoneMin: art === 'fischer' ? 5 : (art === 'hof' || art === 'viehhof' || typ.braucht) ? 2 : 7, braucht: typ.braucht, amWasser: typ.amWasser, steilMax: art === 'fischer' ? 80 : typ.braucht ? 130 : art === 'haus' ? 60 : 45, felsOk: !!typ.braucht, rand: art === 'haus' ? 60 : 250, strRand: art === 'haus' ? 60 : 120 });
    if (grund) continue;
    let felder = [], wert = abstand(o.x, o.y, markt.x, markt.y);
    if (art === 'hof') {
      felder = felderPlanen(z, herr, o);
      if (felder.length < 2) continue;
      let fr = 0;
      for (const f of felder) fr += k.frucht[kachel(f.x, f.y)];
      wert = wert / 2 - fr * 120 - felder.length * 3000;
    } else if (art === 'viehhof') {
      felder = weidePlanen(z, herr, o);
      if (!felder.length) continue;
    } else if (art === 'holzfaeller') {
      let w = 0; const tx = Math.floor(o.x / 1000), ty = Math.floor(o.y / 1000);
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x >= 0 && y >= 0 && x < KARTE_B && y < KARTE_H) w += z.wald[y * KARTE_B + x];
      }
      wert = wert / 3 - w * 8;
    } else if (art === 'haus') {
      wert += zufall(z, 800) - (p.platz ? 6000 : 0);
    }
    if (wert < bestWert) { bestWert = wert; best = { o, felder, wohn }; }
  }
  return best;
}

/** Legt ein Gebäude an (Baustelle oder sofort fertig), rodet, legt Felder an, bindet an. */
export function gebaeudeAnlegen(z, herr, art, o, opt = {}) {
  const typ = GEBAEUDE[art];
  const hpMax = typ.hp || 100;
  const g = {
    id: z.gebaeude.length, art, besitzer: herr, x: o.x, y: o.y, b: o.b, t: o.t, w: o.w,
    zustand: opt.sofort ? 'fertig' : 'bau', arbeit: 0, hp: opt.sofort ? hpMax : Math.floor(hpMax / 4), hpMax,
    belegt: 0, fortschritt: 0, puffer: 0, variante: zufall(z, 4), auftrag: !!opt.auftrag,
    felder: [], aufgabe: 0, aufgabeFeld: -1, traeger: 0, seitLieferung: 0, material: 0, anwerbung: 0, blockiert: '',
  };
  if (typ.lager) g.inhalt = leer();
  if (opt.wohn) g.wohn = opt.wohn;
  if (art === 'schmiede') { g.produkt = 'speere'; g.pufferWaren = { speere: 0, boegen: 0 }; }
  if (typ.plaetze) { g.auto = 'aus'; g.warteschlange = []; }
  z.gebaeude.push(g);
  roden(z, herr, g, 300);
  for (const f of opt.felder || []) {
    const feld = { id: z.felder.length, hof: g.id, art: art === 'viehhof' ? 'weide' : 'acker', x: f.x, y: f.y, b: f.b, t: f.t, w: f.w, stand: 0, phase: 'brach', weg: false };
    z.felder.push(feld); g.felder.push(feld.id);
    roden(z, herr, feld, 0);
  }
  z.version++;
  if (!opt.keinWeg && !typ.mauer) anbinden(z, g, tuer(g));
  return g;
}

/** Bäume unter einem Rechteck fällen; Holz geht ins Lager. */
function roden(z, herr, o, rand) {
  const e = ecken(o);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, e[i]); x1 = Math.max(x1, e[i]); y0 = Math.min(y0, e[i + 1]); y1 = Math.max(y1, e[i + 1]); }
  let holz = 0;
  for (let ty = Math.max(0, Math.floor((y0 - rand) / 1000)); ty <= Math.min(KARTE_H - 1, Math.floor((y1 + rand) / 1000)); ty++) {
    for (let tx = Math.max(0, Math.floor((x0 - rand) / 1000)); tx <= Math.min(KARTE_B - 1, Math.floor((x1 + rand) / 1000)); tx++) {
      const i = ty * KARTE_B + tx;
      if (z.wald[i] && (pruefeMitte(o, tx, ty, rand))) { holz += z.wald[i]; z.wald[i] = 0; }
    }
  }
  if (holz) geben(z, herr, null, 'holz', Math.floor(holz / 25), o.x, o.y);
}
function pruefeMitte(o, tx, ty, rand) {
  const c = COS[o.w], s = SIN[o.w], dx = tx * 1000 + 500 - o.x, dy = ty * 1000 + 500 - o.y;
  const lu = dx * c + dy * s, lv = -dx * s + dy * c;
  return Math.abs(lu) <= (o.b / 2 + rand + 400) * 1024 && Math.abs(lv) <= (o.t / 2 + rand + 400) * 1024;
}

/** Neue Gasse in eine Zone legen (vom nächsten Weg her, dem Gelände folgend, dann hinein verlängert). */
export function planeGasse(z, herr, zone) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  const h = z.herren[herr];
  const burg = z.gebaeude[h.burg], markt = z.gebaeude[h.markt] || burg;
  if (zone === 1) {
    // Wohnland: Gasse als T-Abzweig wie ein Lokator (stadtplaner.js)
    const g = planeWohngasse(z, herr, zone, markt);
    if (g) { strasseHinzufuegen(z, g.punkte, 'gasse'); return true; }
    // WARUM kein Ersatzweg: Wohnland soll nicht mit Stichwegen zerstückelt werden.
    if (zoneVorhandenNah(z, zone, markt)) return false;
  }
  let ziel = -1, bestWert = Infinity;
  for (let i = 0; i < KARTE_B * KARTE_H; i++) {
    if (z.zone[i] !== zone || k.wasser[i] || c.belegt[i] || c.feld[i] || c.strasse[i] || c.mauer[i]) continue;
    if (c.strDist[i] < [0, 3, 6, 6, 4, 3][zone] || k.steil[i] > (zone === 5 ? 75 : 40)) continue;
    if (z.gasseVersucht.includes(i)) continue;
    const x = i % KARTE_B, y = (i - x) / KARTE_B;
    let nachbarn = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < KARTE_B && ny < KARTE_H && z.zone[ny * KARTE_B + nx] === zone && !k.wasser[ny * KARTE_B + nx]) nachbarn++;
    }
    if (nachbarn < 14) continue;
    const d = abstand(x * 1000 + 500, y * 1000 + 500, markt.x, markt.y);
    const wert = (c.strDist[i] === 255 ? 400000 : c.strDist[i] * 6000) + d;
    if (wert < bestWert) { bestWert = wert; ziel = i; }
  }
  if (ziel < 0) return false;
  z.gasseVersucht.push(ziel);
  if (z.gasseVersucht.length > 40) z.gasseVersucht.shift();
  const pfad = findePfad(z, ziel, -1, 'bau', { zielFn: (i) => c.strasse[i] === 1, max: 30000 });
  if (!pfad) return false;
  pfad.reverse();
  // Zufahrt von der Straße, dann gerade Verlängerung in die Zone; am Ende begradigen.
  const ext = [];
  const letzte = pfad[pfad.length - 1];
  let cx = (letzte % KARTE_B) * 1000 + 500, cy = Math.floor(letzte / KARTE_B) * 1000 + 500;
  let dir;
  if (pfad.length >= 3) { const a = pfad[Math.max(0, pfad.length - 4)]; dir = winkelVon(cx - ((a % KARTE_B) * 1000 + 500), cy - (Math.floor(a / KARTE_B) * 1000 + 500)); }
  else dir = winkelVon(cx - markt.x, cy - markt.y);
  let verl = 0;
  const maxVerl = [0, 9, 1, 1, 3, 2][zone];
  for (let s = 0; s < maxVerl; s++) {
    let ok = false;
    for (const dw of [0, -15, 15, -30, 30]) {
      const w = wnorm(dir + dw);
      const nx = cx + Math.trunc(COS[w] * 2000 / 1024), ny = cy + Math.trunc(SIN[w] * 2000 / 1024);
      const tx = Math.floor(nx / 1000), ty = Math.floor(ny / 1000);
      if (tx < 1 || ty < 1 || tx >= KARTE_B - 1 || ty >= KARTE_H - 1) continue;
      const t = ty * KARTE_B + tx;
      if (z.zone[t] !== zone || k.wasser[t] || c.belegt[t] || c.feld[t] || c.mauer[t] || k.steil[t] > (zone === 5 ? 75 : 45)) continue;
      if (c.strDist[t] < 2) continue;
      const mt = kachel(Math.trunc((cx + nx) / 2), Math.trunc((cy + ny) / 2));
      if (c.belegt[mt] || c.feld[mt] || k.wasser[mt]) continue;
      if (Math.abs(k.hoehe[t] - k.hoehe[kachel(cx, cy)]) > (zone === 5 ? 110 : 50)) continue;
      cx = nx; cy = ny; dir = w; ok = true; break;
    }
    if (!ok) break;
    ext.push(kachel(cx, cy)); verl++;
  }
  if (pfad.length + verl * 2 < 5) return false;
  const imZone = pfad.filter((i) => z.zone[i] === zone).length;
  // WARUM 'weg': Außerhalb des Wohnlands sind es Feldwege (zwei Fahrspuren, Grasnarbe), die am Hof enden dürfen.
  strasseHinzufuegen(z, begradigen(z, pfad.concat(ext), null, null), zone === 1 && imZone * 2 >= pfad.length ? 'gasse' : 'weg');
  return true;
}

/** Kennzahlen einer Stadt (auch für die Oberfläche). */
export function stadtStatus(z, herr) {
  const h = z.herren[herr];
  const st = { wohnKap: 0, wohnKapBau: 0, hausBau: 0, haeuser: 0, arbeiterBedarf: 0, arbeiterReserviert: 0, anzahl: {}, anzahlBau: {}, soldaten: 0, plaetze: 0, nahrungProTag: 0, verbrauch: 0, tuerme: 0, mauern: 0 };
  for (const g of z.gebaeude) {
    if (g.besitzer !== herr || g.zustand === 'weg') continue;
    const typ = GEBAEUDE[g.art];
    if (g.zustand === 'fertig') {
      st.anzahl[g.art] = (st.anzahl[g.art] || 0) + 1;
      if (typ.wohnplaetze) { st.wohnKap += g.wohn || typ.wohnplaetze; st.haeuser++; }
      if (typ.arbeiter) st.arbeiterBedarf += typ.arbeiter;
      if (typ.plaetze) st.plaetze += typ.plaetze;
      if (g.art === 'hof') st.nahrungProTag += Math.floor(g.felder.length * FELD.ertrag * 11 / 10 / 20);
      if (g.art === 'viehhof') st.nahrungProTag += Math.floor(2 * 600 / typ.ticksProEinheit);
      if (g.art === 'fischer') st.nahrungProTag += Math.floor(600 / typ.ticksProEinheit);
      if (g.art === 'turm') st.tuerme++;
      if (typ.mauer) st.mauern++;
    } else {
      st.anzahlBau[g.art] = (st.anzahlBau[g.art] || 0) + 1;
      if (typ.wohnplaetze) { st.wohnKapBau += g.wohn || typ.wohnplaetze; st.hausBau++; }
      if (typ.arbeiter) st.arbeiterReserviert += typ.arbeiter;
    }
  }
  for (const u of z.einheiten) if (u.art === 'soldat' && u.besitzer === herr) st.soldaten++;
  st.verbrauch = h.bewohner + st.soldaten;
  st.wohnFrei = st.wohnKap - h.bewohner;
  return st;
}

/** Liegt Wohnland in Straßennähe? Dann gilt: lieber keine Gasse als eine schlechte. */
function zoneVorhandenNah(z, zone) {
  const c = abgeleitet(z);
  for (let i = 0; i < z.zone.length; i++) if (z.zone[i] === zone && c.strDist[i] <= 4) return true;
  return false;
}

function zoneVorhanden(z, zone) {
  for (let i = 0; i < z.zone.length; i++) if (z.zone[i] === zone) return true;
  return false;
}

function bezahlbar(h, art) {
  const kosten = GEBAEUDE[art].kosten || {};
  for (const w in kosten) if ((h.lager[w] || 0) < kosten[w]) return false;
  return true;
}
export function bezahlen(z, herr, art, x, y) {
  const kosten = GEBAEUDE[art].kosten || {};
  for (const w in kosten) nehmen(z, herr, w, kosten[w], x, y);
}

function log(z, herr, text) {
  const h = z.herren[herr];
  h.planLog.push(`T${Math.floor(z.tick / 600)} ${text}`);
  if (h.planLog.length > 12) h.planLog.shift();
}

/** Versucht eine Art zu bauen; legt bei Platzmangel eine Gasse an. */
function versuche(z, herr, art, nahe = null) {
  const h = z.herren[herr], typ = GEBAEUDE[art];
  const notbau = art === 'holzfaeller' && h.lager.holz < 6;
  if (!notbau && !bezahlbar(h, art)) {
    meldung(z, herr, `Baumeister: Für ${typ.name} fehlt Material.`, 'warn', 'mat' + art, 3000);
    return false;
  }
  if (typ.zone && !zoneVorhanden(z, typ.zone)) {
    meldung(z, herr, `Baumeister: Für ${typ.name} ist kein ${ZONEN[typ.zone].name} ausgeschrieben.`, 'warn', 'zone' + art, 4000);
    return false;
  }
  let p = findePlatz(z, herr, art, nahe);
  if (!p && typ.zone) {
    if (planeGasse(z, herr, typ.zone)) { log(z, herr, `neue Gasse in ${ZONEN[typ.zone].name}`); p = findePlatz(z, herr, art); }
  }
  if (!p) {
    meldung(z, herr, `Baumeister: Kein Platz mehr für ${typ.name} im ${ZONEN[typ.zone || 1].name} – schreib mehr Land aus.`, 'warn', 'platz' + art, 4000);
    return false;
  }
  if (!notbau) bezahlen(z, herr, art, p.o.x, p.o.y);
  gebaeudeAnlegen(z, herr, art, p.o, { felder: p.felder, wohn: p.wohn });
  log(z, herr, `plant ${typ.name}`);
  return true;
}

/** Ein Planungsschritt (alle PLANUNG_TAKT Ticks): Wohnraum, dann eine Arbeitsstätte. */
export function planungsSchritt(z, herr) {
  const h = z.herren[herr];
  const st = stadtStatus(z, herr);
  // Wohnraum
  const reserve = 3 + Math.floor(h.bewohner / 15);
  if (st.wohnFrei + st.wohnKapBau < reserve && h.laune >= 40 && vorratReicht(z, herr, st, 5) && st.hausBau < Math.max(1, Math.floor(h.bewohner / 18))) {
    versuche(z, herr, 'haus');
  }
  if (zweiterSpeicher(z, herr, st)) return;
  // Einmal je halbem Tag: offene Gassenenden an Nachbarstraßen anschließen (Schleifen statt Sackgassen)
  if (z.tick % 300 === 50) { const pts = gassenEndeAnschliessen(z); if (pts) { strasseHinzufuegen(z, pts, 'gasse'); log(z, herr, 'Gasse angeschlossen'); } }
  // Arbeit: freie Hände minus Reserve für das Anwerben
  const freiePlaetze = Math.max(0, st.plaetze - st.soldaten);
  let gewollt = 0;
  for (const g of z.gebaeude) if (g.besitzer === herr && g.zustand === 'fertig' && GEBAEUDE[g.art].plaetze) gewollt += (g.warteschlange ? g.warteschlange.length : 0) + (g.auto && g.auto !== 'aus' ? 3 : 0);
  const rekrutReserve = Math.min(3, freiePlaetze, gewollt);
  const frei = h.arbeitslos - st.arbeiterReserviert - rekrutReserve;
  if (frei < 1) return;
  const wunsch = [];
  const nahrungKnapp = st.nahrungProTag < st.verbrauch + 4 || !vorratReicht(z, herr, st, 10);
  const holzfaeller = (st.anzahl.holzfaeller || 0) + (st.anzahlBau.holzfaeller || 0);
  const holzKnapp = holzfaeller < 1 + Math.floor(h.bewohner / 30) || (h.lager.holz < 30 && holzfaeller < 2 + Math.floor(h.bewohner / 20));
  const steinbruch = (st.anzahl.steinbruch || 0) + (st.anzahlBau.steinbruch || 0);
  const erzgrube = (st.anzahl.erzgrube || 0) + (st.anzahlBau.erzgrube || 0);
  const schmiede = (st.anzahl.schmiede || 0) + (st.anzahlBau.schmiede || 0);
  if (nahrungKnapp) wunsch.push('hof', 'viehhof', 'fischer');
  if (holzKnapp) wunsch.push('holzfaeller');
  if (steinbruch < 1 || (h.lager.stein < 25 && steinbruch < 2)) wunsch.push('steinbruch');
  if (erzgrube < Math.max(1, schmiede) && (schmiede > 0 || h.lager.eisen < 10)) wunsch.push('erzgrube');
  if (frei >= 4) wunsch.push('hof', 'viehhof', 'fischer');
  if (frei >= 4 && holzfaeller < 2 + Math.floor(h.bewohner / 25)) wunsch.push('holzfaeller');
  if (frei >= 4 && steinbruch < 2) wunsch.push('steinbruch');
  const versucht = new Set();
  for (const art of wunsch) {
    if (versucht.has(art)) continue;
    versucht.add(art);
    const typ = GEBAEUDE[art];
    if (typ.arbeiter > frei) continue;
    if (typ.zone && !zoneVorhanden(z, typ.zone)) {
      if (nahrungKnapp && art === 'hof') meldung(z, herr, 'Baumeister: Die Vorräte reichen nicht – schreib Ackerland oder Weideland aus.', 'warn', 'zoneNahrung', 4000);
      continue;
    }
    if (versuche(z, herr, art)) return;
  }
}

/** Liegen viele Betriebe weit vom nächsten Lager, baut der Baumeister dort einen Speicher. */
function zweiterSpeicher(z, herr, st) {
  const h = z.herren[herr];
  if ((st.anzahlBau.speicher || 0) > 0 || h.lager.holz < 45) return false;
  const lager = z.gebaeude.filter((g) => g.besitzer === herr && g.zustand === 'fertig' && (g.art === 'speicher' || g.art === 'burg'));
  let n = 0, sx = 0, sy = 0;
  for (const g of z.gebaeude) {
    if (g.besitzer !== herr || g.zustand !== 'fertig' || !GEBAEUDE[g.art].ware) continue;
    let d = Infinity;
    for (const l of lager) d = Math.min(d, abstand(g.x, g.y, l.x, l.y));
    if (d > 15000) { n++; sx += g.x; sy += g.y; }
  }
  if (n < 3 || lager.length + (st.anzahlBau.speicher || 0) > 1 + Math.floor(n / 4) + Math.floor(z.gebaeude.length / 40)) return false;
  const nahe = { x: Math.trunc(sx / n), y: Math.trunc(sy / n) };
  for (const l of lager) if (abstand(l.x, l.y, nahe.x, nahe.y) < 12000) return false;
  if (versuche(z, herr, 'speicher', nahe)) { meldung(z, herr, 'Baumeister: Die Wege sind weit – ein zweiter Speicher wird gebaut.', 'info'); return true; }
  return false;
}
