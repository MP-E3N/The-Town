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

import { KARTE_B, KARTE_H, LAND_RADIUS, FELD, WEIDE, WEGE } from '../data/werte.js';
import { GEBAEUDE, ZONEN } from '../data/gebaeude.js';
import { karteFuer } from './karte.js';
import { abgeleitet, objekteNahe } from './abgeleitet.js';
import { findePfad } from './pfad.js';
import { strasseHinzufuegen, glaetten, anbinden } from './strassen.js';
import { vorratReicht } from './wirtschaft.js';
import { begradigen, planeWohngasse, kernFluchten, gassenEndeAnschliessen } from './stadtplaner.js';
import { geben, nehmen, leer } from './lager.js';
import { ecken, lokal, ueberlappt, abstandStrecke, abstand, kachel, winkelVon, wnorm, zufall, COS, SIN, meldung, flaecheVon, radiusVon, punktIn } from './lib.js';

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
  const r = radiusVon(o); // Trapezfelder reichen über ihr Kernrechteck hinaus
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
    let obj = e.typ === 'g' ? z.gebaeude[e.id] : z.felder[e.id];
    // Häuser zählen mit ihrem Garten dahinter (sonst lagen Gärten unter Nachbarhäusern)
    if (e.typ === 'g' && obj.art === 'haus' && obj.zustand !== 'weg') obj = grundstueck(obj, obj.wohn);
    if (e.typ === 'g' && obj.zustand === 'weg') continue;
    if (e.typ === 'f' && opt.ohneFelder && opt.ohneFelder.has(e.id)) continue; // Nachwachsen: eigene Felder sind kein Hindernis
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
  // Kleine Startfelder (danach wachsen sie in felderWachsen bis an Straße, Nachbarn und Zonenrand).
  const fb = 2200, ft = 3000, out = [];
  // WARUM mit Lücken: Die Felder wachsen reihum aufeinander zu und füllen die Lücken (dicht gesetzte blockieren sich).
  const r0 = Math.floor(o.t / 2) + 300 + ft / 2, r1 = r0 + 4600, r2 = r1 + 4600;
  // Runde 11: mehr mögliche Stellen (auch weiter seitlich, auch erst hinter einem Hindernis) — vorher scheiterten
  // viele Höfe, weil genau die 8 festen Stellen hinter dem Gebäude belegt oder außerhalb der Zone lagen.
  const plaetze = [[-2300, r0], [2300, r0], [-2300, r1], [2300, r1], [0, r0], [0, r1], [-2300, r2], [2300, r2],
    [-4600, r0], [4600, r0], [-4600, r1], [4600, r1], [0, r2], [-4600, r2], [4600, r2], [-1200, r0 + 2300], [1200, r0 + 2300]];
  for (const [lu, lv] of plaetze) {
    if (out.length >= 4) break;
    const p = lokal(o, lu, lv);
    // WARUM ohne Drehung: Die Felder eines Hofs wachsen später im Raster des Hofs (felderWachsen).
    const f = { x: p.x, y: p.y, b: fb, t: ft, w: o.w };
    if (!pruefePlatz(z, herr, f, { zone: 2, zoneMin: 7, steilMax: 90, rand: 120, strRand: 60, extra: [o, ...out] })) out.push(f);
  }
  return out;
}

function weidePlanen(z, herr, o) {
  for (const [lu, lv] of [[0, 0], [-1800, 0], [1800, 0], [-3600, 0], [3600, 0], [0, 2300], [-1800, 2300], [1800, 2300]]) {
    const p = lokal(o, lu, Math.floor(o.t / 2) + 350 + 1700 + lv);
    const f = { x: p.x, y: p.y, b: 3400, t: 3400, w: o.w };
    if (!pruefePlatz(z, herr, f, { zone: 3, zoneMin: 6, steilMax: 90, rand: 120, strRand: 60, extra: [o] })) return [f];
  }
  return [];
}

/** Höfe dürfen am leichten Hang stehen wie Wohnhäuser (vorher 45: Höfe am Hang zum Fluss scheiterten). */
const HOF_STEIL = 60;
const HAUS_B = [1000, 1150, 1300], HAUS_T = [1350, 1600, 1850];
/** Bürgerhäuser nahe dem Markt: größer, mehr Bewohner. */
const STADTHAUS_B = [1150, 1300, 1450], STADTHAUS_T = [1800, 2000, 2200];
const STADTKERN = 11000;
/** Schmales Bürgerhaus: letzte Ausweichgröße im Kern (Hang, enge Stelle), siehe kernPlaetze. */
const LUECKE_B = 1000;
/** Schmalhaus: schließt eine Zahnlücke, in die kein anderes Haus passt (nur dort, siehe kernPlaetze). */
const SCHMAL_B = 700;

/** Gartentiefe hinter einem Haus (Bürgerhaus: kleiner Hinterhof). Gleiche Werte wie render/szene.js zeichneGaerten. */
export function gartenTiefe(wohn) { return wohn === 8 ? 700 : 1000; }
/** Haus + Garten dahinter als ein Rechteck (Grundstück). Die Front (−v) bleibt, nach hinten (+v) wird es tiefer. */
export function grundstueck(o, wohn) {
  const g = gartenTiefe(wohn) + 80, p = lokal(o, 0, Math.trunc(g / 2));
  return { x: p.x, y: p.y, b: o.b, t: o.t + g, w: o.w, art: o.art, zustand: o.zustand };
}
function wdiff(a, b) { const d = Math.abs(wnorm(a) - wnorm(b)); return Math.min(d, 360 - d); }

/**
 * Zeile fortsetzen (Stadtkern): neues Haus Wand an Wand neben H, vordere Ecken treffen sich, ausgerichtet an der
 * Straßenrichtung an dieser Stelle. In der Kurve stehen die Häuser so leicht gegeneinander verdreht — wie in einer
 * Altstadtgasse; den Keil dazwischen füllt die Darstellung mit einem Zwischenstück (Ziehharmonika).
 * Gibt mögliche Rechtecke zurück (erst bündig, dann um 0,1–0,45 Kacheln weiter außen).
 */
function zeilenPlaetze(z, H, sd, b, t) {
  const fc = lokal(H, sd * Math.trunc(H.b / 2), -Math.trunc(H.t / 2));
  const c = abgeleitet(z);
  let best = null, bd = Infinity;
  for (const s of c.segmente) { const d = abstandStrecke(fc.x, fc.y, s.ax, s.ay, s.bx, s.by); if (d < bd) { bd = d; best = s; } }
  if (!best || bd > 2500) return [];
  let w = winkelVon(best.bx - best.ax, best.by - best.ay);
  if (wdiff(w, H.w) > 90) w = wnorm(w + 180);
  if (wdiff(w, H.w) > 35) return []; // zu scharfer Knick: hier endet die Zeile (Ecke/Gasse)
  const out = [];
  for (const schub of [0, 100, 250, 450]) {
    const lu = sd * (Math.trunc(b / 2) + schub), lv = Math.trunc(t / 2);
    out.push({ x: fc.x + Math.trunc((COS[w] * lu - SIN[w] * lv) / 1024), y: fc.y + Math.trunc((SIN[w] * lu + COS[w] * lv) / 1024), b, t, w });
  }
  return out;
}

/**
 * Stadtkern (Runde 10, Blockrand): Bauplätze entlang der Baufluchten (kernFluchten: vier Platzkanten + beide
 * Straßenseiten) dicht abtasten (alle 0,2/0,25 Kacheln) und nur die Stellen anbieten, an denen eine Zeile anfängt
 * oder weitergeht — die Nachbarprobe ist belegt (Nachbarhaus, Platz, einmündende Straße, Rathaus …) oder es ist das
 * Ende einer Platzkante (Ecke). Dort rückt das Haus in 0,05er-Schritten bis an das Hindernis heran.
 * WARUM: Vorher wurden feste Plätze alle ~1,5 Kacheln probiert, und eine Zeile wuchs vom ersten (oft weit entfernten)
 * Haus weiter nach außen; zwischen Platz und Häusern blieb ein leerer Grasstreifen (Nutzerbild Runde 10). Jetzt
 * fängt jede Zeile am Platz oder an der Einmündung an und wächst ohne Lücke weiter.
 * groessen = [[b, t], …] in Vorzugsreihenfolge: Passt das gewürfelte Haus nicht (Hang, schmale Lücke), wird an
 * derselben Stelle ein flacheres/schmaleres probiert — sonst blieben am Hang und zwischen Nachbarn Zahnlücken.
 * Gibt [{ o, platz, kontakt }] zurück; Plätze ohne Kontakt nur jede 4. Probe (Notnagel, schlechter bewertet).
 */
function kernPlaetze(z, herr, markt, groessen, hopt) {
  const out = [];
  const platz = z.gebaeude[z.herren[herr].markt];
  let bmin = Infinity;
  for (const [b] of groessen) bmin = Math.min(bmin, b);
  for (const f of kernFluchten(z, platz, markt, STADTKERN)) {
    // An der Platzkante darf ein Eckhaus 0,3 Kacheln über die Ecke hinausragen (schließt die Ecke)
    const lo = f.platz ? Math.trunc(bmin / 2) - 300 : 0, hi = f.platz ? f.laenge - Math.trunc(bmin / 2) + 300 : f.laenge;
    const schritt = f.platz ? 200 : 250;
    // Haus der Größe b×t an Stelle d (null = außerhalb des Kerns, false = passt nicht)
    const haus = (d, b, t) => {
      if (f.platz && (d - Math.trunc(b / 2) < -300 || d + Math.trunc(b / 2) > f.laenge + 300)) return false;
      const q = f.punkt(d);
      if (!q) return null;
      const off = f.off + Math.trunc(t / 2);
      // Front (−v) zur Linie: +v = Normale → w = Normale − 90; im Kern ohne Zufallsdrehung, sonst klaffen Keile
      const o = { x: q.x + Math.trunc(COS[q.n] * off / 1024), y: q.y + Math.trunc(SIN[q.n] * off / 1024), b, t, w: wnorm(q.n - 90) };
      return pruefePlatz(z, herr, grundstueck(o, 8), hopt) ? false : o;
    };
    const passend = (d) => {
      let r = false;
      for (const [b, t] of groessen) { r = haus(d, b, t); if (r !== false) return r; }
      return r;
    };
    const ds = [];
    for (let d = lo; d <= hi; d += schritt) ds.push(d);
    const os = ds.map(passend);
    // Nachbarprobe belegt? Außerhalb des Kerns (null) zählt nicht; das Ende einer Platzkante ist eine Ecke (zählt).
    const belegt = (i) => (i < 0 || i >= ds.length ? f.platz : os[i] === false);
    for (let i = 0; i < ds.length; i++) {
      if (!os[i]) continue;
      const li = belegt(i - 1), re = belegt(i + 1);
      if (!li && !re) { if (i % 4 === 0) out.push({ o: os[i], platz: f.platz, kontakt: false }); continue; }
      // heranrücken: bis zu 3 × 0,05 Kacheln zum Hindernis hin, in derselben Größe (nicht über die Ecke hinaus)
      let o = os[i];
      const r = li ? -1 : 1;
      if ((r < 0 && i > 0) || (r > 0 && i < ds.length - 1)) {
        for (let s = 1; s <= 3; s++) { const q = haus(ds[i] + r * 50 * s, o.b, o.t); if (!q) break; o = q; }
      }
      out.push({ o, platz: f.platz, kontakt: true });
    }
    // Zahnlücke schließen: Wo keine Größe der Liste passt, aber ein Schmalhaus (SCHMAL_B), und gleich links wie rechts
    // ein Hindernis kommt (die Lücke ist schmaler als ein normales Haus), steht ein schmales Giebelhaus.
    // WARUM nur dort: Schmalhäuser sind der Lückenfüller gewachsener Zeilen, kein Normalfall.
    for (let i = 0; i < ds.length; i++) {
      if (os[i] !== false) continue;
      const o = haus(ds[i], SCHMAL_B, STADTHAUS_T[0]);
      if (!o || haus(ds[i] - 300, SCHMAL_B, STADTHAUS_T[0]) !== false || haus(ds[i] + 300, SCHMAL_B, STADTHAUS_T[0]) !== false) continue;
      out.push({ o, platz: f.platz, kontakt: true });
    }
  }
  return out;
}

/**
 * Bauplatz für ein Wohnhaus: im Stadtkern Bürgerhäuser (8 Plätze) Wand an Wand entlang der Baufluchten
 * (kernPlaetze, zeilenPlaetze), draußen Wohnhäuser (5 Plätze) mit Abstand an den Straßen.
 * Bewertung (kleiner = besser): Abstand zum Markt, Platzfront −6000, Zeilenanschluss −3000, Kernplatz ohne Anschluss
 * +4000. WARUM so: Erst schließt sich die Platzwand, dann wachsen die Zeilen von innen nach außen; ein einzelnes Haus
 * mitten in der Flucht (das später Lücken erzwingt) kommt nur, wenn sonst nichts geht.
 */
function findeHausPlatz(z, herr, markt) {
  const zone = 1;
  const kernOpt = { zone, zoneMin: 7, steilMax: 60, rand: -10, strRand: 60 }; // rand −10 = Berühren erlaubt
  const aussenOpt = { zone, zoneMin: 7, steilMax: 60, rand: 60, strRand: 60 };
  // Gewürfelte Größe zuerst; Ausweichgrößen flacher (Hang) und schmaler (Lücke) — siehe kernPlaetze
  const kb = STADTHAUS_B[zufall(z, 3)], kt = STADTHAUS_T[zufall(z, 3)];
  const groessen = [[kb, kt]];
  for (const g of [[kb, STADTHAUS_T[0]], [STADTHAUS_B[0], STADTHAUS_T[0]], [LUECKE_B, STADTHAUS_T[0]]]) {
    if (!groessen.some((x) => x[0] === g[0] && x[1] === g[1])) groessen.push(g);
  }
  const kand = kernPlaetze(z, herr, markt, groessen, kernOpt);
  // Zeile fortsetzen: genau an der vorderen Ecke des Nachbarn, auch in der Kurve (leicht verdreht)
  for (const H of z.gebaeude) {
    if (H.art !== 'haus' || H.zustand === 'weg' || H.besitzer !== herr || abstand(H.x, H.y, markt.x, markt.y) >= STADTKERN) continue;
    for (const sd of [-1, 1]) {
      let gefunden = false;
      for (const [b, t] of groessen) {
        for (const q of zeilenPlaetze(z, H, sd, b, t)) {
          if (abstand(q.x, q.y, markt.x, markt.y) >= STADTKERN) break;
          if (!pruefePlatz(z, herr, grundstueck(q, 8), kernOpt)) { kand.push({ o: q, platz: false, kontakt: true }); gefunden = true; break; }
        }
        if (gefunden) break;
      }
    }
  }
  // Draußen: wie bisher an den Straßen, mit Abstand und leichter Drehung
  for (const p of strassenPlaetze(z, 1450, 2200, zone, 0, true)) {
    if (abstand(p.x, p.y, markt.x, markt.y) < STADTKERN) continue;
    const b = HAUS_B[zufall(z, 3)], t = HAUS_T[zufall(z, 3)];
    const o = { x: p.x, y: p.y, b, t, w: wnorm(p.w + zufall(z, 5) - 2) };
    // WARUM nachrücken: Platz wurde für die größte Hausgröße gesucht; kleinere rücken an die Straße.
    if (t < 2200) { const q = lokal(o, 0, -Math.floor((2200 - t) / 2)); o.x = q.x; o.y = q.y; }
    if (!pruefePlatz(z, herr, grundstueck(o, 5), aussenOpt)) kand.push({ o, aussen: true });
  }
  let best = null, bw = Infinity;
  for (const q of kand) {
    const wert = abstand(q.o.x, q.o.y, markt.x, markt.y) + zufall(z, 800) - (q.platz ? 6000 : 0) - (q.kontakt ? 3000 : 0) + (!q.aussen && !q.kontakt ? 4000 : 0);
    if (wert < bw) { bw = wert; best = { o: q.o, felder: [], wohn: q.aussen ? 5 : 8 }; }
  }
  return best;
}

/** Bester Platz für eine Gebäudeart in ihrer Zone, oder null. */
export function findePlatz(z, herr, art, nahe = null) {
  const typ = GEBAEUDE[art], k = karteFuer(z.seed);
  const zone = typ.zone || 0;
  const markt = nahe || z.gebaeude[z.herren[herr].markt] || z.gebaeude[z.herren[herr].burg];
  if (art === 'haus') return findeHausPlatz(z, herr, markt);
  let best = null, bestWert = Infinity;
  const b0 = typ.b, t0 = typ.t;
  const plaetze = strassenPlaetze(z, b0, t0, zone, (art === 'hof' || art === 'viehhof') ? 2 : typ.braucht ? 2 : 0, false);
  for (const p of plaetze) {
    const o = { x: p.x, y: p.y, b: b0, t: t0, w: wnorm(p.w + zufall(z, 9) - 4) };
    const grund = pruefePlatz(z, herr, o, { zone, zoneMin: art === 'fischer' ? 5 : (art === 'hof' || art === 'viehhof' || typ.braucht) ? 2 : 7, braucht: typ.braucht, amWasser: typ.amWasser, steilMax: art === 'fischer' ? 80 : typ.braucht ? 130 : (art === 'hof' || art === 'viehhof') ? HOF_STEIL : 45, felsOk: !!typ.braucht, rand: 250, strRand: 120 });
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
    }
    if (wert < bestWert) { bestWert = wert; best = { o, felder, wohn: 0 }; }
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
  const felder = (art === 'hof' || art === 'viehhof') && opt.felder && opt.felder.length ? felderWachsen(z, herr, g, opt.felder, art === 'viehhof') : opt.felder || [];
  for (const f of felder) {
    const feld = { id: z.felder.length, hof: g.id, art: art === 'viehhof' ? 'weide' : 'acker', x: f.x, y: f.y, b: f.b, t: f.t, w: f.w, stand: 0, phase: 'brach', weg: false };
    if (f.poly) feld.poly = f.poly; // Trapezfeld (zwickelFuellen)
    z.felder.push(feld); g.felder.push(feld.id);
    roden(z, herr, feld, 0);
  }
  z.version++;
  if (!opt.keinWeg && !typ.mauer) anbinden(z, g, tuer(g));
  return g;
}

/**
 * Felder wachsen lassen wie in echter Flur (Flickenteppich): Jede Seite jedes Feldes rückt reihum um 0,4 (zuletzt 0,1) Kacheln
 * vor, bis eine Straße, ein Nachbar (Hecke 0,12 Kacheln), der Zonenrand, Wasser, Fels oder Steilhang erreicht ist
 * oder die Grenze (FELD.maxFeld je Feld, FELD.maxHof je Hof; Weide WEIDE.maxFeld) erreicht ist.
 * WARUM im Raster des Hofs: Alle Felder eines Hofs liegen parallel; nach vorn (Straße, Hof-Front) wachsen sie nicht.
 * Rechnet in lokalen Koordinaten des Hofs (u quer, v von der Straße weg), ganzzahlig.
 */
function felderWachsen(z, herr, hof, felder, weide, ohne = null, breiter = 0) {
  const zone = weide ? 3 : 2;
  const maxFeld = weide ? WEIDE.maxFeld : FELD.maxFeld, maxSumme = weide ? WEIDE.maxFeld : FELD.maxHof;
  const c = COS[hof.w], s = SIN[hof.w];
  const r = felder.map((f) => {
    const dx = f.x - hof.x, dy = f.y - hof.y;
    const lu = Math.trunc((dx * c + dy * s) / 1024), lv = Math.trunc((-dx * s + dy * c) / 1024);
    return { u0: lu - Math.trunc(f.b / 2), u1: lu + Math.trunc(f.b / 2), v0: lv - Math.trunc(f.t / 2), v1: lv + Math.trunc(f.t / 2) };
  });
  const rechteck = (q) => { const p = lokal(hof, Math.trunc((q.u0 + q.u1) / 2), Math.trunc((q.v0 + q.v1) / 2)); return { x: p.x, y: p.y, b: q.u1 - q.u0, t: q.v1 - q.v0, w: hof.w }; };
  const flaeche = (q) => (q.u1 - q.u0) * (q.v1 - q.v0);
  const vorn = -Math.trunc(hof.t / 2);
  // WARUM Streifen (Hufe): Wachsen die Felder seitlich die ganze Straße entlang, findet der nächste Hof an
  // derselben Achse keinen Platz mehr — und der Baumeister müsste für jeden Hof einen neuen Weg anlegen.
  // So liegen die Höfe an EINEM Weg aufgereiht, jeder mit seinem Flurstreifen dahinter.
  let seitlich = weide ? 5000 : 4600;
  for (const q of r) seitlich = Math.max(seitlich, -q.u0, q.u1);
  // Nachwachsen: Der Streifen darf breiter werden (sonst bliebe Land neben dem Hof für immer brach, wenn dort kein
  // weiterer Hof mehr entsteht).
  seitlich += breiter;
  let summe = 0;
  for (const q of r) summe += flaeche(q);
  // Grob (0,4 Kacheln), dann fein (0,1): sonst blieben zwischen Nachbarfeldern Spalten bis zu einer halben Kachel.
  for (const [schritt, runden] of [[400, 40], [100, 8]]) for (let runde = 0; runde < runden; runde++) {
    let gewachsen = false;
    for (let i = 0; i < r.length; i++) {
      for (let k4 = 0; k4 < 4; k4++) {
        const seite = (k4 + runde + i) % 4, q = { ...r[i] };
        if (seite === 0) q.u0 -= schritt; else if (seite === 1) q.u1 += schritt; else if (seite === 2) q.v0 -= schritt; else q.v1 += schritt;
        if (q.v0 < vorn || q.u0 < -seitlich || q.u1 > seitlich) continue;
        const b = q.u1 - q.u0, t = q.v1 - q.v0;
        if (b > 3 * t || t > 3 * b) continue; // keine endlosen Streifen
        const neu = flaeche(q), alt = flaeche(r[i]);
        if (neu > maxFeld || summe - alt + neu > maxSumme) continue;
        const extra = [hof];
        for (let j = 0; j < r.length; j++) if (j !== i) extra.push(rechteck(r[j]));
        if (!feldFrei(z, herr, rechteck(q), zone, extra, ohne)) continue;
        summe += neu - alt; r[i] = q; gewachsen = true;
      }
    }
    if (!gewachsen) break;
  }
  return zwickelFuellen(z, herr, hof, r, zone, seitlich, vorn, maxFeld, maxSumme, summe, ohne);
}

/**
 * Zwickel füllen: Nach dem Rechteck-Wachsen schiebt jedes Feld seine Ecken einzeln weiter hinaus, bis Straße,
 * Ufer, Nachbar oder Zonenrand sie aufhalten — so entstehen Trapeze und schräge Feldenden, die auch die Keile an
 * schrägen Wegen und am Wasser nutzen (wie echte Flur). Vorne (zur Straße) bleibt die Kante gerade.
 * Ecken (lokal am Hof): A vorn links, B vorn rechts, C hinten rechts, D hinten links.
 * e = [A nach −u, B nach +u, C nach +u, D nach −u, C nach +v, D nach +v] in Milli-Kacheln.
 * WARUM nur konvexe Vierecke: Kollision (Trennachsen-Test) und Darstellung bleiben einfach und exakt.
 */
function zwickelFuellen(z, herr, hof, r, zone, seitlich, vorn, maxFeld, maxSumme, summe, ohne = null) {
  const ZW_MAX = 6000;
  const lokPoly = (q, e) => [q.u0 - e[0], q.v0, q.u1 + e[1], q.v0, q.u1 + e[2], q.v1 + e[4], q.u0 - e[3], q.v1 + e[5]];
  const weltFeld = (q, e) => {
    const l = lokPoly(q, e), poly = [];
    for (let i = 0; i < 8; i += 2) { const p = lokal(hof, l[i], l[i + 1]); poly.push(p.x, p.y); }
    const m = lokal(hof, Math.trunc((q.u0 + q.u1) / 2), Math.trunc((q.v0 + q.v1) / 2));
    const f = { x: m.x, y: m.y, b: q.u1 - q.u0, t: q.v1 - q.v0, w: hof.w };
    if (e.some((v) => v > 0)) f.poly = poly;
    return f;
  };
  const konvex = (l) => {
    let vz = 0;
    for (let i = 0; i < 8; i += 2) {
      const j = (i + 2) % 8, k = (i + 4) % 8;
      const cr = (l[j] - l[i]) * (l[k + 1] - l[j + 1]) - (l[j + 1] - l[i + 1]) * (l[k] - l[j]);
      if (cr === 0) continue;
      if (vz === 0) vz = Math.sign(cr); else if (Math.sign(cr) !== vz) return false;
    }
    return true;
  };
  const ext = r.map(() => [0, 0, 0, 0, 0, 0]);
  const fl = (i) => flaecheVon(weltFeld(r[i], ext[i]));
  for (const [schritt, runden] of [[400, 15], [100, 6]]) for (let runde = 0; runde < runden; runde++) {
    let gewachsen = false;
    for (let i = 0; i < r.length; i++) {
      for (let k6 = 0; k6 < 6; k6++) {
        const p = (k6 + runde + i) % 6, e = ext[i].slice();
        e[p] += schritt;
        if (e[p] > ZW_MAX) continue;
        const l = lokPoly(r[i], e);
        if (l[0] < -seitlich || l[6] < -seitlich || l[2] > seitlich || l[4] > seitlich || l[1] < vorn) continue;
        if (!konvex(l)) continue;
        const kand = weltFeld(r[i], e);
        const alt = fl(i), neu = flaecheVon(kand);
        if (neu > maxFeld || summe - alt + neu > maxSumme) continue;
        const extra = [hof];
        for (let j = 0; j < r.length; j++) if (j !== i) extra.push(weltFeld(r[j], ext[j]));
        if (!feldFrei(z, herr, kand, zone, extra, ohne)) continue;
        summe += neu - alt; ext[i] = e; gewachsen = true;
      }
    }
    if (!gewachsen) break;
  }
  return r.map((q, i) => weltFeld(q, ext[i]));
}

/** Darf hier ein (gewachsenes) Feld liegen? Wie pruefePlatz, aber das Innere wird dicht abgetastet. */
function feldFrei(z, herr, f, zone, extra, ohne = null) {
  if (pruefePlatz(z, herr, f, { steilMax: 1e9, felsOk: true, rand: 120, strRand: 60, extra, ohneFelder: ohne })) return false;
  const k = karteFuer(z.seed);
  let n = 0, drin = 0;
  if (f.poly) {
    // Viereck: bilinear abtasten (Zellmitten, etwa alle 0,7 Kacheln) — liegt automatisch etwas innerhalb der Kanten
    const e = f.poly;
    const nu = Math.max(1, Math.ceil(Math.max(abstand(e[0], e[1], e[2], e[3]), abstand(e[6], e[7], e[4], e[5])) / 700));
    const nv = Math.max(1, Math.ceil(Math.max(abstand(e[0], e[1], e[6], e[7]), abstand(e[2], e[3], e[4], e[5])) / 700));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const s = 2 * i + 1, t = 2 * j + 1, S = 2 * nu, T = 2 * nv;
      const x = Math.trunc(((S - s) * (T - t) * e[0] + s * (T - t) * e[2] + s * t * e[4] + (S - s) * t * e[6]) / (S * T));
      const y = Math.trunc(((S - s) * (T - t) * e[1] + s * (T - t) * e[3] + s * t * e[5] + (S - s) * t * e[7]) / (S * T));
      if (x < 0 || y < 0 || x >= KARTE_B * 1000 || y >= KARTE_H * 1000) return false;
      const q = kachel(x, y);
      if (k.wasser[q] || k.fels[q] > 55 || k.erz[q] > 55 || k.steil[q] > 70) return false;
      n++;
      if (z.zone[q] === zone) drin++;
    }
    return drin * 100 >= n * 85;
  }
  // Raster etwa alle 0,7 Kacheln, 0,25 Kacheln vom Rand entfernt
  const hb = Math.max(0, Math.trunc(f.b / 2) - 250), ht = Math.max(0, Math.trunc(f.t / 2) - 250);
  const nu = Math.max(1, Math.ceil(2 * hb / 700)), nv = Math.max(1, Math.ceil(2 * ht / 700));
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const p = lokal(f, -hb + Math.trunc(2 * hb * i / nu), -ht + Math.trunc(2 * ht * j / nv));
      if (p.x < 0 || p.y < 0 || p.x >= KARTE_B * 1000 || p.y >= KARTE_H * 1000) return false;
      const t = kachel(p.x, p.y);
      if (k.wasser[t] || k.fels[t] > 55 || k.erz[t] > 55 || k.steil[t] > FELD.steilMax) return false;
      n++;
      if (z.zone[t] === zone) drin++;
    }
  }
  return drin * 100 >= n * 85;
}

/** Arbeiter-Ticks je Nahrung eines Viehhofs: große Weide = mehr Vieh (Faktor 0,5 … 2). */
export function viehTakt(z, g) {
  let p = 0;
  for (const id of g.felder) if (!z.felder[id].weg) p += feldProzent(z.felder[id]);
  return Math.floor(GEBAEUDE.viehhof.ticksProEinheit * 100 / Math.max(50, Math.min(200, p || 100)));
}

/** Fläche eines Feldes im Verhältnis zum Normalfeld, in Prozent (Ertrag und Arbeit skalieren damit). */
export function feldProzent(f) {
  return Math.max(20, Math.floor(flaecheVon(f) / ((f.art === 'weide' ? WEIDE.basis : FELD.basis) / 100)));
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
  if (o.poly) return punktIn(o, tx * 1000 + 500, ty * 1000 + 500, rand + 400);
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
    if (g) { strasseHinzufuegen(z, g.punkte, 'gasse', 'gasse'); return true; }
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
  const achse = zone === 2 || zone === 3 ? feldwegAchse(z, zone, ziel) : null;
  if (achse) { strasseHinzufuegen(z, achse, 'weg', 'erschliessung'); return true; }
  // Notlösung Suchweg (A*, begradigt). WARUM begrenzt: Gewundene Feldwege zwischen den Feldern sahen wirr aus —
  // für Acker und Weide höchstens EIN Knick. Forst/Bergbau liegen am Hang hinter Wald: dort darf er sich winden.
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
  const punkte = begradigen(z, pfad.concat(ext), null, null);
  const knicke = Math.max(0, Math.round((punkte.length / 2 - 2) / 3)); // ecktenRunden: 3 Punkte je Ecke
  if ((zone === 2 || zone === 3) && knicke > 1) return false;
  // WARUM 'weg': Außerhalb des Wohnlands sind es Feldwege (zwei Fahrspuren, Grasnarbe), die am Hof enden dürfen.
  strasseHinzufuegen(z, punkte, zone === 1 && imZone * 2 >= pfad.length ? 'gasse' : 'weg', 'erschliessung');
  return true;
}

/**
 * Feldweg-Achse: EINE gerade Linie von der nächsten Straße ins ausgeschriebene Land und quer hindurch bis zu
 * dessen Rand (oder bis zu einer anderen Straße → Schleife). Höfe reihen sich dann beidseitig daran auf.
 * Probiert die nächsten Straßenpunkte und je ±10°/±20°. Gibt die Punktliste [ax,ay,bx,by] oder null.
 */
function feldwegAchse(z, zone, ziel) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  // WARUM Schwerpunkt: Der Zielpunkt liegt am Rand des Gebiets (nah an Straßen); eine Achse dorthin streift das
  // Land nur. Durch die Mitte des freien Landes (Umkreis 9 Kacheln) erschließt sie es der ganzen Länge nach.
  const tx0 = ziel % KARTE_B, ty0 = Math.floor(ziel / KARTE_B);
  let sx = 0, sy = 0, sn = 0;
  for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
    const x = tx0 + dx, y = ty0 + dy;
    if (dx * dx + dy * dy > 81 || x < 0 || y < 0 || x >= KARTE_B || y >= KARTE_H) continue;
    const i = y * KARTE_B + x;
    if (z.zone[i] === zone && !k.wasser[i] && !c.feld[i] && !c.belegt[i] && !c.strasse[i]) { sx += x; sy += y; sn++; }
  }
  const zx = sn ? Math.trunc(sx * 1000 / sn) + 500 : tx0 * 1000 + 500, zy = sn ? Math.trunc(sy * 1000 / sn) + 500 : ty0 * 1000 + 500;
  // nächste Punkte auf Straßen (je Straße einer)
  const kand = new Map();
  for (const s of c.segmente) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    let t1000 = l2 ? Math.trunc(((zx - s.ax) * dx + (zy - s.ay) * dy) * 1000 / l2) : 0;
    t1000 = Math.max(0, Math.min(1000, t1000));
    const qx = s.ax + Math.trunc(dx * t1000 / 1000), qy = s.ay + Math.trunc(dy * t1000 / 1000), d = abstand(qx, qy, zx, zy);
    const alt = kand.get(s.strasse);
    if (!alt || d < alt.d) kand.set(s.strasse, { x: qx, y: qy, d, id: s.strasse });
  }
  const liste = [...kand.values()].filter((q) => q.d <= WEGE.zufahrtMax + 8000).sort((a, b) => a.d - b.d || a.id - b.id).slice(0, 4);
  for (const q of liste) {
    const w0 = winkelVon(zx - q.x, zy - q.y);
    for (const dw of [0, -10, 10, -20, 20]) {
      const w = wnorm(w0 + dw);
      let laenge = 0, inZone = 0, ende = null, hVor = k.hoehe[kachel(q.x, q.y)], verbunden = false;
      for (let st = 1; st <= WEGE.achseMax / 500; st++) {
        const x = q.x + Math.trunc(COS[w] * st * 500 / 1024), y = q.y + Math.trunc(SIN[w] * st * 500 / 1024);
        if (x < 1000 || y < 1000 || x >= (KARTE_B - 1) * 1000 || y >= (KARTE_H - 1) * 1000) break;
        const t = kachel(x, y), h = k.hoehe[t];
        if (Math.abs(h - hVor) > 40) break; // am Hang: nicht hinauf, lieber eine andere Richtung
        hVor = h;
        if (st > 3 && c.strasse[t]) { if (inZone >= 12) { ende = { x, y }; verbunden = true; } break; }
        if (k.wasser[t] || c.belegt[t] || c.feld[t] || c.mauer[t] || k.fels[t] > 55 || k.erz[t] > 55) break;
        // nicht parallel neben einer anderen Straße herlaufen
        if (st > 3 && c.strDist[t] <= 1) break;
        if (z.zone[t] === zone) inZone++;
        else if (inZone > 0) break;          // Zone wieder verlassen: Achse endet am Rand
        else if (st * 500 > WEGE.zufahrtMax) break; // zu lange Zufahrt durch fremdes Land
        laenge = st * 500; ende = { x, y };
      }
      // mindestens 6 Kacheln im ausgeschriebenen Land (sonst streift die Achse es nur)
      if (ende && inZone >= 12 && (laenge >= 4000 || verbunden)) return [q.x, q.y, ende.x, ende.y];
    }
  }
  return null;
}

/** Kennzahlen einer Stadt (auch für die Oberfläche). */
export function stadtStatus(z, herr) {
  const h = z.herren[herr];
  const st = { wohnKap: 0, wohnKapBau: 0, hausBau: 0, haeuser: 0, arbeiterBedarf: 0, arbeiterReserviert: 0, anzahl: {}, anzahlBau: {}, soldaten: 0, plaetze: 0, nahrungProTag: 0, verbrauch: 0, tuerme: 0, mauern: 0 };
  for (const g of z.gebaeude) {
    if (g.besitzer !== herr || g.zustand === 'weg') continue;
    const typ = GEBAEUDE[g.art];
    if (g.zustand === 'ruine') { st.ruinen = (st.ruinen || 0) + 1; continue; } // abgebrannter Hof: kein Dach, keine Arbeit
    if (g.zustand === 'fertig') {
      st.anzahl[g.art] = (st.anzahl[g.art] || 0) + 1;
      if (typ.wohnplaetze) { st.wohnKap += g.wohn || typ.wohnplaetze; st.haeuser++; }
      if (typ.arbeiter) st.arbeiterBedarf += typ.arbeiter;
      if (typ.plaetze) st.plaetze += typ.plaetze;
      if (g.art === 'hof') { let p = 0; for (const id of g.felder) if (!z.felder[id].weg) p += feldProzent(z.felder[id]); st.nahrungProTag += Math.floor(p * FELD.ertrag * 11 / 1000 / 20); }
      if (g.art === 'viehhof') st.nahrungProTag += Math.floor(typ.arbeiter * 600 / viehTakt(z, g));
      if (g.art === 'fischer') st.nahrungProTag += Math.floor(typ.arbeiter * 600 / typ.ticksProEinheit);
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
/** Baukosten zahlen: der Baumeister aus den Lagern der Stadt, Aufträge des Herrn (wer 'herr') zuerst aus der Burg. */
export function bezahlen(z, herr, art, x, y, wer = 'stadt') {
  const kosten = GEBAEUDE[art].kosten || {};
  for (const w in kosten) nehmen(z, herr, w, kosten[w], x, y, wer);
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
  // WARUM nur Häuser im Wohnland: Der Fischerhütte hilft keine Gasse (sie braucht Ufer) — früher entstanden so
  // an Tag 1–2 sechs Gassen ohne ein einziges Haus daran. Und je Zone höchstens ein neuer Weg pro Tag:
  // lieber einmal eine gute, lange Achse als bei jedem Fehlschlag ein neues Stück.
  // Hat ein neuer Weg für diese Art nichts gebracht, keinen weiteren bauen, bis der Herr wieder Land ausschreibt.
  const sp = (z.wegSperre || {})[art], sperre = (typ.zone === 2 || typ.zone === 3) && !!sp && (sp.v === z.zonenVersion || z.tick < sp.bis);
  const wegErlaubt = typ.zone && !sperre && (typ.zone !== 1 || art === 'haus') && z.tick - ((z.wegZuletzt || {})[typ.zone] ?? -1e9) >= WEGE.abstandTicks;
  if (!p && wegErlaubt) {
    (z.wegZuletzt || (z.wegZuletzt = {}))[typ.zone] = z.tick;
    // Nur wenn ein neuer Weg nichts gebracht hat: gesperrt bis neues Land ausgeschrieben ist, mindestens 3 Tage.
    if (planeGasse(z, herr, typ.zone)) { log(z, herr, `neue ${typ.zone === 1 ? 'Gasse' : 'Feldweg-Achse'} in ${ZONEN[typ.zone].name}`); p = findePlatz(z, herr, art); if (!p) (z.wegSperre || (z.wegSperre = {}))[art] = { v: z.zonenVersion, bis: z.tick + 3 * 600 }; }
  }
  if (!p) {
    // Runde 11: Bei Höfen ehrlich sagen, woran es liegt — oft ist Land frei, aber kein Hofplatz an einem Weg
    if (art === 'hof' || art === 'viehhof') meldung(z, herr, `Baumeister: Kein Platz für einen neuen ${typ.name} an einem Weg. Freies ${ZONEN[typ.zone].name} nutzen die Nachbarhöfe nach und nach; für mehr Höfe größere zusammenhängende Flächen ausschreiben.`, 'warn', 'platz' + art, 4000);
    else meldung(z, herr, `Baumeister: Kein Platz mehr für ${typ.name} im ${ZONEN[typ.zone || 1].name} – schreib mehr Land aus.`, 'warn', 'platz' + art, 4000);
    return false;
  }
  if (!notbau) bezahlen(z, herr, art, p.o.x, p.o.y);
  gebaeudeAnlegen(z, herr, art, p.o, { felder: p.felder, wohn: p.wohn });
  log(z, herr, `plant ${typ.name}`);
  return true;
}

/**
 * Flur-Auswertung (nur lesend, für Anzeige und Messung): ordnet jede Kachel Acker- (2) und Weideland (3) ein.
 * Klassen: 1 Feld/Weide · 2 frei = Reserve für einen neuen Hof · 3 Rest (zusammenhängend < FELD.restKacheln) ·
 * 4 zu steil (> FELD.steilMax, z. B. Uferböschung) · 5 Fels/Erz · 6 Wege, Höfe, andere Bauten ·
 * 7 frei, aber ohne Weg und ohne Nachbarhof (erst ein neuer Feldweg erschließt es).
 * WARUM dieselben Grenzen wie feldFrei: Die Anzeige darf nicht „wird noch genutzt“ sagen, wo der Baumeister nie baut.
 */
export const FLUR_KLASSEN = ['', 'Felder', 'frei (Reserve)', 'Rest (zu klein)', 'zu steil', 'Fels', 'Wege/Bauten', 'frei, ohne Weg'];
export function flurAuswertung(z) {
  const k = karteFuer(z.seed), c = abgeleitet(z), N = KARTE_B * KARTE_H;
  const klasse = new Uint8Array(N);
  for (let t = 0; t < N; t++) {
    const zo = z.zone[t];
    if ((zo !== 2 && zo !== 3) || k.wasser[t]) continue;
    if (c.feld[t]) klasse[t] = 1;
    else if (c.belegt[t] || c.strasse[t]) klasse[t] = 6;
    else if (k.fels[t] > 55 || k.erz[t] > 55) klasse[t] = 5;
    else if (k.steil[t] > FELD.steilMax) klasse[t] = 4;
    else klasse[t] = 2;
  }
  // Kleine freie Inseln (je Zone zusammenhängend) sind Rest: dort passt kein Hof mit Feldern mehr hin.
  const gesehen = new Uint8Array(N);
  for (let t = 0; t < N; t++) {
    if (klasse[t] !== 2 || gesehen[t]) continue;
    const zo = z.zone[t], teil = [t]; gesehen[t] = 1;
    for (let i = 0; i < teil.length; i++) {
      const q = teil[i], x = q % KARTE_B, y = (q - x) / KARTE_B;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= KARTE_B || ny >= KARTE_H) continue;
        const n = ny * KARTE_B + nx;
        if (!gesehen[n] && klasse[n] === 2 && z.zone[n] === zo) { gesehen[n] = 1; teil.push(n); }
      }
    }
    if (teil.length < FELD.restKacheln) { for (const q of teil) klasse[q] = 3; continue; }
    // Erreichbar? Ein Weg in der Nähe (neuer Hof) oder ein Feld daneben (Nachwachsen)
    let erreichbar = false;
    for (const q of teil) {
      if (c.strDist[q] <= 4) { erreichbar = true; break; }
      const x = q % KARTE_B, y = (q - x) / KARTE_B;
      for (let dy = -2; dy <= 2 && !erreichbar; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < KARTE_B && ny < KARTE_H && klasse[ny * KARTE_B + nx] === 1) { erreichbar = true; break; } }
      if (erreichbar) break;
    }
    if (!erreichbar) for (const q of teil) klasse[q] = 7;
  }
  const zaehl = () => [0, 0, 0, 0, 0, 0, 0, 0];
  const acker = zaehl(), weide = zaehl();
  for (let t = 0; t < N; t++) if (klasse[t]) (z.zone[t] === 2 ? acker : weide)[klasse[t]]++;
  return { klasse, acker, weide, version: z.version, zonenVersion: z.zonenVersion };
}

/**
 * Warum entsteht gerade kein neuer Hof? Gleiche Bedingungen wie planungsSchritt (Nahrung knapp ODER genug freie Hände).
 * Liefert einen kurzen Satz für die Anzeige.
 */
export function hofAusblick(z, herr) {
  const h = z.herren[herr], st = stadtStatus(z, herr);
  const frei = h.arbeitslos - st.arbeiterReserviert;
  const knapp = st.nahrungProTag < st.verbrauch + 4 || !vorratReicht(z, herr, st, 10);
  const bau = (st.anzahlBau.hof || 0) + (st.anzahlBau.viehhof || 0);
  if (bau) return `${bau} Hof im Bau.`;
  if (frei < GEBAEUDE.viehhof.arbeiter) return `Neuer Hof erst, wenn mehr Leute frei sind (jetzt ${Math.max(0, frei)} ohne Arbeit, ein Hof braucht ${GEBAEUDE.hof.arbeiter}).`;
  if (knapp || frei >= 4) return 'Der Baumeister sucht einen Platz für einen neuen Hof.';
  return 'Nahrung reicht — freies Land bleibt Reserve, bis mehr gebraucht wird.';
}

/**
 * Felder bestehender Höfe wachsen nach (Runde 11): einmal je Planungstag ein Hof, der am längsten wartet. Seine Felder
 * wachsen erneut (Rechteck, dann Zwickel) in freies Acker-/Weideland — bis Straße, Nachbar, Zonenrand, Hang oder
 * FELD.maxHof. WARUM: Vorher wuchsen Felder nur beim Anlegen des Hofs; später ausgeschriebenes oder frei gewordenes
 * Land daneben blieb für immer brach (Nutzerbild: Hang zwischen Feldweg und Fluss). Übernommen wird das Ergebnis nur,
 * wenn die Gesamtfläche größer wird; jedes Feld behält seine ID, Saat, Stand und Pflege.
 */
function felderNachwachsen(z, herr) {
  let hof = null;
  for (const g of z.gebaeude) {
    if (g.besitzer !== herr || g.zustand !== 'fertig' || (g.art !== 'hof' && g.art !== 'viehhof')) continue;
    if (!hof || (g.nachgewachsen || 0) < (hof.nachgewachsen || 0)) hof = g;
  }
  if (!hof) return false;
  hof.nachgewachsen = z.tick;
  const felder = hof.felder.map((id) => z.felder[id]).filter((f) => !f.weg);
  if (!felder.length) return false;
  const alt = felder.reduce((a, f) => a + flaecheVon(f), 0);
  const kern = felder.map((f) => ({ x: f.x, y: f.y, b: f.b, t: f.t, w: f.w }));
  const neu = felderWachsen(z, herr, hof, kern, hof.art === 'viehhof', new Set(felder.map((f) => f.id)), FELD.nachwachsenBreiter);
  const summe = neu.reduce((a, f) => a + flaecheVon(f), 0);
  if (summe <= alt + 1000000) return false; // weniger als 1 Kachel² mehr: lohnt nicht
  neu.forEach((n, i) => {
    const f = felder[i];
    f.x = n.x; f.y = n.y; f.b = n.b; f.t = n.t; f.w = n.w;
    if (n.poly) f.poly = n.poly; else delete f.poly;
    roden(z, herr, f, 0);
  });
  z.version++;
  log(z, herr, `${GEBAEUDE[hof.art].name}: Felder +${Math.round((summe - alt) / 1e6)} Kacheln²`);
  return true;
}

/**
 * Diagnose (nur lesend): Warum findet ein neuer Hof keinen Platz? Zählt für jeden Kandidaten an einer Straße den
 * ersten Ablehnungsgrund (Gebäude: pruefePlatz-Grund; sonst „zu wenig Startfelder“). Für Messung und Anzeige.
 */
export function hofPlatzDiagnose(z, herr, art = 'hof') {
  const typ = GEBAEUDE[art], zone = typ.zone, gruende = {};
  const plaetze = strassenPlaetze(z, typ.b, typ.t, zone, 2, false);
  let ok = 0;
  for (const p of plaetze) {
    const o = { x: p.x, y: p.y, b: typ.b, t: typ.t, w: p.w };
    let g = pruefePlatz(z, herr, o, { zone, zoneMin: 2, steilMax: HOF_STEIL, rand: 250, strRand: 120 });
    if (!g) {
      const f = art === 'hof' ? felderPlanen(z, herr, o) : weidePlanen(z, herr, o);
      if (f.length < (art === 'hof' ? 2 : 1)) {
        g = 'Startfelder passen nicht';
        // Grund des nächstgelegenen Startfelds mitzählen (welches Hindernis?)
        const q = lokal(o, 0, Math.floor(o.t / 2) + 1800);
        const fg = pruefePlatz(z, herr, { x: q.x, y: q.y, b: 2200, t: 3000, w: o.w }, { zone: art === 'hof' ? 2 : 3, zoneMin: 7, steilMax: 90, rand: 120, strRand: 60, extra: [o] });
        if (fg) gruende['  Feld dahinter: ' + fg] = (gruende['  Feld dahinter: ' + fg] || 0) + 1;
      }
    }
    if (g) gruende[g] = (gruende[g] || 0) + 1; else ok++;
  }
  return { kandidaten: plaetze.length, ok, gruende };
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
  // Zweimal am Tag wachsen die Felder eines Hofs in freies Nachbarland nach (Reserve wird genutzt)
  if (z.tick % 300 === 250) felderNachwachsen(z, herr);
  // Einmal je halbem Tag: offene Gassenenden an Nachbarstraßen anschließen (Schleifen statt Sackgassen)
  if (z.tick % 300 === 50) { const pts = gassenEndeAnschliessen(z); if (pts) { strasseHinzufuegen(z, pts, 'gasse', 'anschluss'); log(z, herr, 'Gasse angeschlossen'); } }
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
