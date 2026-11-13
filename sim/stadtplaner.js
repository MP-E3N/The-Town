/**
 * stadtplaner.js — Wie ein mittelalterlicher Lokator Straßen legt (siehe .claude/skills/stadtplaner).
 *
 * ZWECK:    1) Wege begradigen: aus einem Kachelweg (A*) gerade Strecken machen, wo das Gelände es zulässt,
 *              Ecken als sanfte Bögen — keine „Würmer“.
 *           2) Wohngassen: zweigen im rechten Winkel (T-Kreuzung) von bestehenden Straßen ab, laufen gerade
 *              oder an der Höhenlinie entlang, halten Blocktiefe zur Nachbargasse, enden an einer anderen
 *              Straße (Schleife) oder am Rand des Wohnlands — nie mitten im Nichts.
 *           3) Baufluchten im Kern (kernFluchten): vier Platzkanten + Straßenseiten, an denen Häuser Wand an Wand
 *              stehen; Kennzahlen dazu (kernKennzahlen: Platzwand, Lücken) für Werkzeug und Test.
 * LIEST:    Karte, abgeleitete Raster, z.zone
 * SCHREIBT: nichts direkt außer über strasseHinzufuegen (planeWohngasse)
 * REGEL:    Deterministisch, ganzzahlig. Gelände lesen = Höhenunterschied je Kachel (k.hoehe) prüfen:
 *           ≤ 30 je 0,4 Kacheln entlang des Wegs, sonst biegt der Weg ab (folgt der Höhenlinie).
 * DEBUG:    spiel.z.herren[0].planLog
 */

import { KARTE_B, KARTE_H } from '../data/werte.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { karteFuer } from './karte.js';
import { abgeleitet } from './abgeleitet.js';
import { kachel, abstand, abstandStrecke, ecken, lokal, punktIn, winkelVon, wnorm, COS, SIN } from './lib.js';

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

/**
 * Schneidet vorne und hinten ab, was schon auf vorhandener Straße liegt (die letzte Straßenkachel bleibt als
 * Anschluss). WARUM: Die Wegsuche nutzt bestehende Straßen gern (billig); begradigt würde daraus eine zweite,
 * parallele Straße daneben. So zweigt die neue Straße dort ab, wo sie die alte wirklich verlässt.
 */
export function nurNeuerTeil(z, pfad) {
  const c = abgeleitet(z);
  let a = 0, b = pfad.length - 1;
  while (a + 1 < b && c.strasse[pfad[a]] && c.strasse[pfad[a + 1]]) a++;
  while (b - 1 > a && c.strasse[pfad[b]] && c.strasse[pfad[b - 1]]) b--;
  return pfad.slice(a, b + 1);
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

/**
 * Baufluchten im Stadtkern (Runde 10, Blockrand): Linien, an denen Häuser mit der Front stehen — die VIER Kanten des
 * Marktplatzes (Front zum Platz) und beide Seiten jeder Straße nahe dem Markt (Front zur Straße).
 * WARUM alle vier Platzkanten: Ein Marktplatz ist ringsum von Häusern umschlossen; offen bleibt er nur, wo Straßen
 * einmünden (dort lehnt pruefePlatz ab). Früher gab es nur die zwei Längsseiten mit drei festen Plätzen.
 * Jede Flucht: { platz, laenge, off, punkt(d) } — punkt(d) liefert für die Bogenlänge d den Punkt auf der Linie und
 * die Normale n (zeigt vom Platz/von der Straße weg, dorthin steht das Haus) oder null außerhalb des Kerns.
 * off = Abstand der Hausfront von der Linie (Platzkante bzw. Straßenmitte).
 */
export function kernFluchten(z, platz, markt, radius) {
  const out = [];
  if (platz) {
    const e = ecken(platz);
    // Ecken-Reihenfolge von ecken(): (−u,−v) (+u,−v) (+u,+v) (−u,+v) → Kanten mit Normale −v, +u, +v, −u
    const nw = [270, 0, 90, 180];
    for (let i = 0; i < 4; i++) {
      const ax = e[2 * i], ay = e[2 * i + 1], bx = e[(2 * i + 2) % 8], by = e[(2 * i + 3) % 8];
      const L = abstand(ax, ay, bx, by), n = wnorm(platz.w + nw[i]);
      out.push({ platz: true, laenge: L, off: 160, punkt: (d) => ({ x: ax + Math.trunc((bx - ax) * d / L), y: ay + Math.trunc((by - ay) * d / L), n }) });
    }
  }
  const c = abgeleitet(z);
  // Zusammenhängende Ketten von Segmenten im Kern (abgeleitet.js legt sie Straße für Straße entlang strassenLinie an);
  // verlässt eine Straße den Kern und kommt wieder, sind das zwei Ketten.
  const ketten = [];
  let kette = null, vor = null;
  for (const sg of c.segmente) {
    if (abstandStrecke(markt.x, markt.y, sg.ax, sg.ay, sg.bx, sg.by) > radius) { kette = null; continue; }
    if (!kette || !vor || vor.strasse !== sg.strasse || vor.bx !== sg.ax || vor.by !== sg.ay) { kette = []; ketten.push(kette); }
    kette.push(sg); vor = sg;
  }
  for (const sgs of ketten) {
    const lang = sgs.map((sg) => abstand(sg.ax, sg.ay, sg.bx, sg.by));
    let L = 0;
    for (const l of lang) L += l;
    const hb = sgs[0].hb;
    for (const seite of [1, -1]) {
      out.push({
        platz: false, laenge: L, off: hb + 110,
        punkt: (d) => {
          let r = d;
          for (let i = 0; i < sgs.length; i++) {
            if (r > lang[i] && i < sgs.length - 1) { r -= lang[i]; continue; }
            const sg = sgs[i], l = lang[i] || 1, x = sg.ax + Math.trunc((sg.bx - sg.ax) * r / l), y = sg.ay + Math.trunc((sg.by - sg.ay) * r / l);
            if (abstand(x, y, markt.x, markt.y) > radius) return null;
            return { x, y, n: wnorm(winkelVon(sg.bx - sg.ax, sg.by - sg.ay) + seite * 90) };
          }
          return null;
        },
      });
    }
  }
  return out;
}

/**
 * Kennzahlen des Stadtkerns (nur lesen; für tools/stadtplan.mjs und den Test):
 * - Platzwand: Der Platzrand wird alle 0,25 Kacheln abgetastet. „Haus“ = eine Hausfront liegt ≤ 0,6 Kacheln entfernt,
 *   „Gebäude“ = Haus oder ein anderes Gebäude (Rathaus, Kirche, Speicher …), „Einmündung“ = dort mündet eine Straße.
 *   WARUM Einmündungen getrennt: Dort darf (und soll) die Platzwand offen sein.
 * - Zeilen im Kern (≤ kern Milli vom Markt): je Haus und Seite der Abstand der vorderen Ecke zum nächsten Gebäude.
 *   ≤ 0,35 Kacheln = Wand an Wand; Straße oder Platz daneben = Zeilenende (ende); sonst Nachbar 0,35–1,5 Kacheln =
 *   Lücke (zu schmal für ein Haus, sieht aus wie eine Zahnlücke); noch weiter = freie Seite (Zeile wächst dort weiter).
 */
export function kernKennzahlen(z, herr, kern = 11000) {
  const c = abgeleitet(z), platz = z.gebaeude[z.herren[herr].markt];
  const out = { punkte: 0, haus: 0, gebaeude: 0, einmuendung: 0, seiten: 0, wand: 0, ende: 0, luecke: 0 };
  if (!platz) return out;
  const haeuser = z.gebaeude.filter((g) => g.art === 'haus' && g.zustand !== 'weg' && g.besitzer === herr);
  const andere = z.gebaeude.filter((g) => g.zustand !== 'weg' && g.art !== 'haus' && g.art !== 'platz' && !GEBAEUDE[g.art].mauer && abstand(g.x, g.y, platz.x, platz.y) < 12000);
  const front = (g) => { const a = lokal(g, -Math.trunc(g.b / 2), -Math.trunc(g.t / 2)), b = lokal(g, Math.trunc(g.b / 2), -Math.trunc(g.t / 2)); return [a.x, a.y, b.x, b.y]; };
  const fronten = haeuser.filter((g) => abstand(g.x, g.y, platz.x, platz.y) < 9000).map(front);
  const e = ecken(platz);
  for (let i = 0; i < 8; i += 2) {
    const j = (i + 2) % 8, n = Math.max(1, Math.round(abstand(e[i], e[i + 1], e[j], e[j + 1]) / 250));
    for (let s = 0; s < n; s++) {
      const px = e[i] + Math.trunc((e[j] - e[i]) * s / n), py = e[i + 1] + Math.trunc((e[j + 1] - e[i + 1]) * s / n);
      out.punkte++;
      let mund = false;
      for (const sg of c.segmente) if (abstandStrecke(px, py, sg.ax, sg.ay, sg.bx, sg.by) <= sg.hb + 250) { mund = true; break; }
      if (mund) { out.einmuendung++; continue; }
      let h = false;
      for (const f of fronten) if (abstandStrecke(px, py, f[0], f[1], f[2], f[3]) <= 600) { h = true; break; }
      let g = h;
      if (!g) for (const o of andere) if (punktIn(o, px, py, 600)) { g = true; break; }
      if (h) out.haus++;
      if (g) out.gebaeude++;
    }
  }
  // Nachbar = jedes Gebäude (auch Rathaus, Kirche, Speicher: sie gehören zur Platzwand). Gemessen wird, wie weit die
  // vordere Hausecke vom Körper des Nachbarn entfernt ist — so zählen auch Eckhäuser über Eck und versetzte Tiefen.
  const nachbarn = haeuser.concat(andere);
  for (const H of haeuser) {
    if (abstand(H.x, H.y, platz.x, platz.y) >= kern) continue;
    for (const sd of [-1, 1]) {
      // Probe 0,05 Kacheln außerhalb der eigenen Seitenwand, in Stufen nach außen
      const q = lokal(H, sd * (Math.trunc(H.b / 2) + 50), -Math.trunc(H.t / 2) + 50);
      let bd = Infinity;
      for (const G of nachbarn) {
        if (G === H || abstand(G.x, G.y, H.x, H.y) > 9000) continue;
        for (const r of [350, 1500]) if (r < bd && punktIn(G, q.x, q.y, r)) { bd = r; break; }
      }
      out.seiten++;
      if (bd <= 350) { out.wand++; continue; }
      // Liegt neben der Ecke eine Straße oder der Platz, endet die Zeile dort (Einmündung, Platzecke) — keine Lücke
      const s = lokal(H, sd * (Math.trunc(H.b / 2) + 500), -Math.trunc(H.t / 2) + 300);
      let ende = punktIn(platz, q.x, q.y, 600);
      for (const sg of c.segmente) if (!ende && abstandStrecke(s.x, s.y, sg.ax, sg.ay, sg.bx, sg.by) <= sg.hb + 400) ende = true;
      if (ende) out.ende++;
      else if (bd <= 1500) out.luecke++;
    }
  }
  return out;
}

/**
 * Offene Gassenenden nachträglich anschließen: Liegt in Verlängerung (±30°) innerhalb von 7 Kacheln eine andere
 * Straße und ist der Weg frei und nicht zu steil, wird die Lücke geschlossen. So entstehen Schleifen und
 * Querverbindungen wie in gewachsenen Städten statt Stichwegen, die im Nichts enden.
 * Gibt die neue Punktliste zurück oder null.
 */
export function gassenEndeAnschliessen(z) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  for (const s of z.strassen) {
    if (s.art !== 'gasse' || s.angeschlossen) continue;
    const p = s.punkte, n = p.length / 2;
    if (n < 2) continue;
    const ex = p[p.length - 2], ey = p[p.length - 1], vx = p[p.length - 4], vy = p[p.length - 3];
    // Endet schon an einer anderen Straße?
    let schonVerbunden = false;
    for (const t of z.strassen) {
      if (t === s) continue;
      const q = t.punkte;
      for (let i = 0; i + 3 < q.length; i += 2) {
        const dx = q[i + 2] - q[i], dy = q[i + 3] - q[i + 1], l2 = dx * dx + dy * dy || 1;
        let tt = ((ex - q[i]) * dx + (ey - q[i + 1]) * dy) / l2; tt = Math.max(0, Math.min(1, tt));
        if (abstand(ex, ey, q[i] + Math.trunc(dx * tt), q[i + 1] + Math.trunc(dy * tt)) < t.breite / 2 + 500) { schonVerbunden = true; break; }
      }
      if (schonVerbunden) break;
    }
    if (schonVerbunden) { s.angeschlossen = true; continue; }
    const w0 = winkelVon(ex - vx, ey - vy);
    for (const dw of [0, -15, 15, -30, 30]) {
      const w = wnorm(w0 + dw);
      let cx = ex, cy = ey, ok = false;
      const pts = [ex, ey];
      for (let st = 1; st <= 7; st++) {
        const nx = ex + Math.trunc(COS[w] * st * 1000 / 1024), ny = ey + Math.trunc(SIN[w] * st * 1000 / 1024);
        const t = kachel(nx, ny);
        if (t < 0 || t >= KARTE_B * KARTE_H) break;
        if (Math.abs(k.hoehe[t] - k.hoehe[kachel(cx, cy)]) > 45) break;
        if (st >= 2 && c.strasse[t] && abstand(nx, ny, ex, ey) > 1200) { pts.push(nx, ny); ok = true; break; }
        if (k.wasser[t] || c.belegt[t] || c.feld[t] || c.mauer[t]) break;
        cx = nx; cy = ny;
      }
      if (ok) { s.angeschlossen = true; return pts; }
    }
    s.angeschlossen = true; // nicht ständig neu prüfen; bei neuen Straßen erneut (siehe strassen.js)
  }
  return null;
}
